// ============================================================
//  অ্যাডভান্সড M3U8 প্রোক্সি - ডিবাগ ও টাইমআউট সহ
// ============================================================

const ALLOWED_DOMAINS = [
    'line.umetop.pro',
    '185.243.7.47',
    'bldcmprod-cdn.toffeelive.com',
    'toffeelive.com'
];

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache'
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
            return new Response('❌ "url" প্যারামিটার দিন। যেমন: ?url=https://example.com/file.m3u8', {
                status: 400,
                headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // ডোমেইন চেক
        try {
            const target = new URL(targetUrl);
            const isAllowed = ALLOWED_DOMAINS.some(domain =>
                target.hostname === domain || target.hostname.endsWith(`.${domain}`)
            );
            if (!isAllowed) {
                return new Response('⛔ এই ডোমেইন প্রক্সি করার অনুমতি নেই', {
                    status: 403,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                });
            }
        } catch (e) {
            return new Response('❌ ভুল URL', { status: 400 });
        }

        // হেডার তৈরি
        const headers = new Headers(DEFAULT_HEADERS);
        if (request.headers.has('Cookie')) {
            headers.set('Cookie', request.headers.get('Cookie'));
        }
        if (request.headers.has('Referer')) {
            headers.set('Referer', request.headers.get('Referer'));
        }
        // রেফারার ফোর্স করুন (PHP স্ক্রিপ্টের জন্য)
        headers.set('Referer', 'https://line.umetop.pro/');

        try {
            // ১. টাইমআউট সহ ফেচ (৩০ সেকেন্ড)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(targetUrl, {
                method: 'GET',
                headers: headers,
                redirect: 'follow',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            // ২. রেস্পন্স স্ট্যাটাস চেক
            if (!response.ok) {
                // রেস্পন্স বডি পড়ার চেষ্টা করুন
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (_) {}
                return new Response(
                    `❌ সার্ভার এরর: ${response.status} ${response.statusText}\n\n${errorText.substring(0, 500)}`,
                    { status: response.status, headers: { 'Access-Control-Allow-Origin': '*' } }
                );
            }

            // ৩. ফাইনাল URL (রিডাইরেক্টের পর)
            const finalUrl = response.url;
            const contentType = response.headers.get('content-type') || '';
            const isM3u8 = contentType.includes('mpegurl') ||
                           contentType.includes('vnd.apple.mpegurl') ||
                           finalUrl.includes('.m3u8');

            if (isM3u8) {
                const content = await response.text();
                const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);
                const rewritten = rewriteM3U8(content, baseUrl, url.origin);

                return new Response(rewritten, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    }
                });
            }

            // ৪. যদি M3U8 না হয় (যেমন HTML বা JSON), তাহলে সেটি রিটার্ন করুন
            return new Response(response.body, {
                status: response.status,
                headers: {
                    ...Object.fromEntries(response.headers),
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            // ৫. এরর হ্যান্ডেল
            let errorMsg = error.message;
            if (error.name === 'AbortError') {
                errorMsg = 'টাইমআউট: সার্ভার ৩০ সেকেন্ডের মধ্যে রেস্পন্স দেয়নি';
            }
            return new Response(
                `🔥 প্রোক্সি ব্যর্থ: ${errorMsg}\n\nটার্গেট URL: ${targetUrl}`,
                {
                    status: 502,
                    headers: { 'Access-Control-Allow-Origin': '*' }
                }
            );
        }
    }
};

function rewriteM3U8(content, baseUrl, proxyOrigin) {
    const lines = content.split('\n');
    const result = [];
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            result.push(line);
        } else {
            try {
                const absoluteUrl = new URL(trimmed, baseUrl).href;
                const proxied = `${proxyOrigin}?url=${encodeURIComponent(absoluteUrl)}`;
                result.push(proxied);
            } catch {
                result.push(line);
            }
        }
    }
    return result.join('\n');
}
