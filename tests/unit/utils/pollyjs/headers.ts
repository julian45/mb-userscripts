import type { Headers as PollyHeadersT } from '@pollyjs/core';
import { Headers as FetchHeadersT } from 'node-fetch';

export type CRLFHeadersT = string;

export const PollyHeaders = {
    fromFetchHeaders(fetchHeaders: FetchHeadersT): PollyHeadersT {
        const pollyHeaders: Record<string, string> = {};
        fetchHeaders.forEach((v, k) => {
            pollyHeaders[k] = v;
        });
        return pollyHeaders;
    },
};

export const FetchHeaders = {
    fromPollyHeaders(pollyHeaders: PollyHeadersT): FetchHeadersT {
        const headersInit: Record<string, string> = {};
        Object.entries(pollyHeaders).forEach(([k, v]) => {
            headersInit[k] = Array.isArray(v) ? v[0] : v;
        });
        return new FetchHeadersT(headersInit);
    },
};

export const CRLFHeaders = {
    fromPollyHeaders(pollyHeaders: PollyHeadersT): CRLFHeadersT {
        return Object.entries(pollyHeaders)
            .flatMap(([k, v]) => {
                if (!Array.isArray(v)) {
                    v = [v];
                }

                return v.map((vi) => `${k}: ${vi}`);
            })
            .join('\r\n');
    },
};
