import type { Har, HarEntry, HarLog as RealHarLog, HarRequest, HarResponse } from '@pollyjs/persister';
import type { WARCRecord } from 'warcio/src/warcrecord';
import { WARCParser } from 'warcio/src/warcparser';

import { assert, assertHasValue } from '@lib/util/assert';

import type { WARCInfoFields, WARCRecordMetadataFields } from './types';

interface HarLog extends RealHarLog {
    creator: Record<string, string>;
    _recordingName: string;
}

export default async function warc2har(warc: Uint8Array): Promise<Har> {
    const harLog = {
        pages: [],
    } as unknown as HarLog;

    const entryMap = new Map<string, HarEntry>();

    for await (const record of WARCParser.iterRecords([warc])) {
        let entry: HarEntry;
        switch(record.warcType) {
        case 'warcinfo':
            await populateHarLogInfo(record, harLog); break;
        case 'request':
            entry = getOrCreateEntry(entryMap, record.warcHeader('WARC-Concurrent-To'));
            await populateEntryRequest(record, entry);
            break;
        case 'response':
            entry = getOrCreateEntry(entryMap, record.warcHeader('WARC-Record-ID'));
            await populateEntryResponse(record, entry);
            break;
        case 'metadata':
            entry = getOrCreateEntry(entryMap, record.warcHeader('WARC-Concurrent-To'));
            await populateEntryMetadata(record, entry);
            break;
        default:
            console.log(`Unsupported WARC entry type: ${record.warcType}`);
        }
    }

    harLog.entries = [...entryMap.values()].sort((e1, e2) => e1._order - e2._order);
    return {
        log: harLog,
    };
}

function getOrCreateEntry(entryMap: Map<string, HarEntry>, warcRecordId: string | null): HarEntry {
    assertHasValue(warcRecordId);
    if (!entryMap.has(warcRecordId)) {
        entryMap.set(warcRecordId, { cache: {}, request: {}, response: {} } as unknown as HarEntry);
    }

    return entryMap.get(warcRecordId)!;
}

async function parseWARCFields<T>(record: WARCRecord): Promise<T> {
    assert(record.warcContentType === 'application/warc-fields', 'Wrong content type for record');
    const content = await record.contentText();
    return Object.fromEntries(content.split('\r\n')
        .map((line) => line.split(': ')));
}

async function populateHarLogInfo(record: WARCRecord, log: HarLog): Promise<void> {
    const metadata = await parseWARCFields<WARCInfoFields>(record);
    log.version = metadata.harVersion;
    log.creator = JSON.parse(metadata.harCreator);

    const filename = record.warcHeader('WARC-Filename');
    assertHasValue(filename);
    log._recordingName = filename;
}

async function populateEntryMetadata(record: WARCRecord, entry: HarEntry): Promise<void> {
    const metadata = await parseWARCFields<WARCRecordMetadataFields>(record);

    entry._id = metadata.harEntryId;
    entry._order = parseInt(metadata.harEntryOrder);
    entry.cache = JSON.parse(metadata.cache);
    entry.startedDateTime = metadata.startedDateTime;
    entry.time = parseInt(metadata.time);
    entry.timings = JSON.parse(metadata.timings);
    // @ts-expect-error hack
    entry.responseShouldBeEncoded = JSON.parse(metadata.responseDecoded);

    // @ts-expect-error: Typo
    const request: HarRequest = entry.request;
    request.headersSize = parseInt(metadata.warcRequestHeadersSize);
    request.cookies = JSON.parse(metadata.warcRequestCookies);

    entry.response.cookies = JSON.parse(metadata.warcResponseCookies);
    entry.response.headersSize = parseInt(metadata.warcResponseHeadersSize);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    entry.response.content = {} as { mimeType: string };
    if (metadata.warcResponseContentEncoding) {
        entry.response.content.encoding = metadata.warcResponseContentEncoding;
    }
}

function httpHeadersToKeyValue(record: WARCRecord): Array<{ name: string; value: string}> {
    return [...record.httpHeaders.headers.entries()].map(([name, value]) => {
        return { name, value };
    });
}

function parseQueryString(path: string): Array<{ name: string; value: string}> {
    return [...new URLSearchParams(path.split('?')[1]).entries()]
        .map(([name, value]) => {
            return { name, value };
        });
}

async function populateEntryRequest(record: WARCRecord, entry: HarEntry): Promise<void> {
    const [method, path, httpVersion] = record.httpHeaders.statusline.split(' ');
    const request: HarRequest = {
        // @ts-expect-error: Typo in declarations
        ...entry.request,
        httpVersion,
        method,
        bodySize: 0,
        url: record.warcTargetURI,
        headers: httpHeadersToKeyValue(record),
        queryString: parseQueryString(path),
    };

    // @ts-expect-error: Typo in declarations
    entry.request = request;
}

async function populateEntryResponse(record: WARCRecord, entry: HarEntry): Promise<void> {
    const [httpVersion, status, ...statusTextParts] = record.httpHeaders.statusline.split(' ');
    const headers = httpHeadersToKeyValue(record);
    const bodyEncoded = await record.readFully();
    const response: HarResponse = {
        ...entry.response,
        bodySize: bodyEncoded.length,
        headers,
        httpVersion,
        status: parseInt(status),
        statusText: statusTextParts.join(' '),
    };


    const mimeType = record.httpHeaders.headers.get('content-type');
    assertHasValue(mimeType);
    response.content.mimeType = mimeType;
    response.content.size = bodyEncoded.length;

    const bodyBuffer = Buffer.from(bodyEncoded);
    // @ts-expect-error hack
    response.content.text = bodyBuffer.toString(entry.responseShouldBeEncoded ? 'base64' : 'utf8');

    entry.response = response;
}
