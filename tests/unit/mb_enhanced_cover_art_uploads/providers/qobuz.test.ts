import { ArtworkTypeIDs } from '@lib/MB/CoverArt';
import { QobuzProvider } from '@src/mb_enhanced_cover_art_uploads/providers/qobuz';
import { setupPolly } from '@test-utils/pollyjs';
import { itBehavesLike } from '@test-utils/shared_behaviour';

import { findImagesSpec } from './find_images_spec';
import { urlMatchingSpec } from './url_matching_spec';

describe('qobuz provider', () => {
    const pollyContext = setupPolly();
    const provider = new QobuzProvider();

    describe('url matching', () => {
        const supportedUrls = [{
            desc: 'www URLs with language',
            url: 'https://www.qobuz.com/gb-en/album/crime-of-the-century-2014-hd-remaster-supertramp/0060075354770',
            id: '0060075354770',
        }, {
            desc: 'www URLs without language',
            url: 'https://www.qobuz.com/album/crime-of-the-century-2014-hd-remaster-supertramp/0060075354770',
            id: '0060075354770',
        }, {
            desc: 'open URLs',
            url: 'https://open.qobuz.com/album/0074643811224',
            id: '0074643811224',
        }, {
            desc: 'open URLs with additional path component',
            url: 'https://open.qobuz.com/album/1234567890/related',
            id: '1234567890',
        }];

        const unsupportedUrls = [{
            desc: 'label URLs',
            url: 'https://www.qobuz.com/gb-en/label/universal-music-group-international/download-streaming-albums',
        }, {
            desc: 'label URLs with ID',
            url: 'https://www.qobuz.com/nl-nl/label/universal-music-group-international/download-streaming-albums/92570',
        }, {
            desc: 'artist URLs',
            url: 'https://www.qobuz.com/nl-nl/interpreter/supertramp/download-streaming-albums',
        }, {
            desc: 'open artist URLs',
            url: 'https://open.qobuz.com/artist/50195',
        }];

        // eslint-disable-next-line jest/require-hook
        itBehavesLike(urlMatchingSpec, { provider, supportedUrls, unsupportedUrls });
    });

    describe('extracting images', () => {
        const extractionCases = [{
            desc: 'release without booklet',
            url: 'https://open.qobuz.com/album/0060075330437',
            numImages: 1,
            expectedImages: [{
                index: 0,
                urlPart: '/images/covers/37/04/0060075330437_org.jpg',
                types: [ArtworkTypeIDs.Front],
            }],
        }, {
            desc: 'release with booklet',
            url: 'https://open.qobuz.com/album/0825646089178',
            numImages: 2,
            expectedImages: [{
                index: 0,
                urlPart: '/images/covers/78/91/0825646089178_org.jpg',
                types: [ArtworkTypeIDs.Front],
            }, {
                index: 1,
                urlPart: '000078807.pdf',
                types: [ArtworkTypeIDs.Booklet],
                comment: 'Qobuz booklet',
            }],
        }];

        // No failure cases because it'll fall back to URL rewriting, but the
        // cover image shouldn't exist.
        // eslint-disable-next-line jest/require-hook
        itBehavesLike(findImagesSpec, { provider, extractionCases, extractionFailedCases: [], pollyContext });

        it('falls back to URL rewriting when API returns 404', async () => {
            pollyContext.polly.configure({
                recordFailedRequests: true,
            });

            const covers = await provider.findImages(new URL('https://www.qobuz.com/us-en/album/sunburn-fuel/y8859avlbfe3a'));

            expect(covers).toBeArrayOfSize(1);
            expect(covers[0]).toMatchCoverArt({
                urlPart: '/images/covers/3a/fe/y8859avlbfe3a_org.jpg',
                types: [ArtworkTypeIDs.Front],
            });
        });

        describe('with invalid app ID', () => {
            // Separate describe block so we can patch out console.error before
            // this single test case, while leaving it in place for other tests.

            beforeEach(() => {
                // Need to patch out console.error, since it's expected to be
                // called in this test case but jest prints the message even
                // though the test passes. There seems to be no straightforward
                // way of disabling this for a single test case only.
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                jest.spyOn(console, 'error').mockImplementationOnce(() => {});
            });

            it('throws on invalid app ID', async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed to spy on private method.
                const spyAppId = jest.spyOn(QobuzProvider as any, 'QOBUZ_APP_ID', 'get');
                spyAppId.mockReturnValueOnce('123');

                pollyContext.polly.configure({
                    recordFailedRequests: true,
                });

                await expect(provider.findImages(new URL('https://open.qobuz.com/album/0825646089178')))
                    .rejects.toThrowWithMessage(Error, /app ID invalid\?/);
            });
        });
    });

    describe('extracting goodies', () => {
        it('sets booklet type if goodie is a booklet', () => {
            const covers = QobuzProvider['extractGoodies']([{
                original_url: 'https://example.com/original_url',
                url: 'https://example.com/url',
                name: 'Livret Numérique',
                id: 123,
                file_format_id: 456,
                description: 'test',
            }]);

            expect(covers[0]).toMatchCoverArt({
                urlPart: /^https:\/\/example\.com\/original_url$/,
                types: [ArtworkTypeIDs.Booklet],
                comment: 'Qobuz booklet',
            });
        });

        it('sets no type if goodie is not a booklet', () => {
            const covers = QobuzProvider['extractGoodies']([{
                original_url: 'https://example.com/original_url',
                url: 'https://example.com/url',
                name: 'not a booklet',
                id: 123,
                file_format_id: 456,
                description: 'test',
            }]);

            expect(covers[0]).toMatchCoverArt({
                urlPart: /^https:\/\/example\.com\/original_url$/,
                types: [],
                comment: 'not a booklet',
            });
        });

        it('ignores goodie if URL is not set', () => {
            const covers = QobuzProvider['extractGoodies']([{
                // eslint-disable-next-line unicorn/numeric-separators-style
                id: 111512,
                file_format_id: 52,
                name: 'Clip vidéo',
                description: 'Evrika (B)',
                url: null,
                original_url: null,
            }, {
                // eslint-disable-next-line unicorn/numeric-separators-style
                id: 111513,
                file_format_id: 21,
                name: 'Livret Numérique',
                description: 'Pink Floyd - The Endless River',
                url: 'https://example.com/url',
                original_url: 'https://example.com/original_url',
            }]);

            expect(covers).toBeArrayOfSize(1);
        });
    });

    describe('constructing cover URL from ID', () => {
        it('constructs the correct cover URL', () => {
            // Not the most powerful of tests, the output of this method will
            // likely be nonsensical if an ID with less that 4 characters is
            // provided, but we're assuming that won't happen.
            expect(QobuzProvider['idToCoverUrl']('0825646089178').href)
                .toBe('https://static.qobuz.com/images/covers/78/91/0825646089178_org.jpg');
        });
    });
});
