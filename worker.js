// ============================================================
//  অ্যাডভান্সড M3U8 প্রোক্সি - রিডাইরেক্ট ও হেডার সাপোর্ট সহ
// ============================================================

// অনুমোদিত ডোমেইন (যে ডোমেইনগুলো প্রক্সি করা যাবে)
const ALLOWED_DOMAINS = [
    'line.umetop.pro',
    '185.243.7.47',
    'bldcmprod-cdn.toffeelive.com',
    'toffeelive.com'
];

// ডিফল্ট হেডার (ব্রাউজার ইমিটেট করার জন্য)
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1'
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

        // ১. ডোমেইন চেক (নিরাপত্তা)
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

        // ২. হেডার তৈরি করুন
        const headers = new Headers(DEFAULT_HEADERS);
        // ইউজারের কুকি বা হেডার ফরওয়ার্ড করুন (যদি থাকে)
        if (request.headers.has('Cookie')) {
            headers.set('Cookie', request.headers.get('Cookie'));
        }
        if (request.headers.has('Referer')) {
            headers.set('Referer', request.headers.get('Referer'));
        }

        try {
            // ৩. প্রথম রিকোয়েস্ট পাঠান (রিডাইরেক্ট ফলো সহ)
            const response = await fetch(targetUrl, {
                method: 'GET',
                headers: headers,
                redirect: 'follow'    // ← এটাই ম্যাজিক! PHP-র রিডাইরেক্ট ফলো করবে
            });

            // ৪. ফাইনাল URL বের করুন (রিডাইরেক্টের পরের URL)
            const finalUrl = response.url;

            // ৫. কন্টেন্ট টাইপ চেক করুন
            const contentType = response.headers.get('content-type') || '';
            const isM3u8 = contentType.includes('mpegurl') ||
                           contentType.includes('vnd.apple.mpegurl') ||
                           finalUrl.includes('.m3u8');

            // ৬. যদি M3U8 হয়, তাহলে রিরাইট করুন
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

            // ৭. যদি M3U8 না হয় (যেমন PHP রেস্পন্স), তবুও রিটার্ন করুন
            return new Response(response.body, {
                status: response.status,
                headers: {
                    ...Object.fromEntries(response.headers),
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            return new Response(`🔥 প্রোক্সি ব্যর্থ: ${error.message}`, {
                status: 502,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }
    }
};

// M3U8 ফাইলের সব লিংক রিরাইট করুন
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
