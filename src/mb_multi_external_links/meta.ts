import type { UserscriptMetadata } from '@lib/util/metadata';
import { transformMBMatchURL } from '@lib/util/metadata';

const metadata: UserscriptMetadata = {
    name: 'MB: QoL: Paste multiple external links at once',
    description: 'Enables pasting multiple links, separated by whitespace, into the external link editor.',
    'run-at': 'document-end',
    match: [
        '*/edit',
    ].map(transformMBMatchURL),
};

export default metadata;
