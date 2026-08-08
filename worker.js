// ============================================================
//  ইউনিভার্সাল M3U8 প্রোক্সি - কোনো ডোমেইন রেস্ট্রিকশন নেই
// ============================================================

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
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

        // হেডার তৈরি করুন
        const headers = new Headers(DEFAULT_HEADERS);
        
        // ইউজারের কুকি ও রেফারার ফরওয়ার্ড করুন (যদি থাকে)
        if (request.headers.has('Cookie')) {
            headers.set('Cookie', request.headers.get('Cookie'));
        }
        if (request.headers.has('Referer')) {
            headers.set('Referer', request.headers.get('Referer'));
        } else {
            // PHP স্ক্রিপ্টের জন্য ডামি রেফারার যোগ করুন
            try {
                const targetHost = new URL(targetUrl).hostname;
                headers.set('Referer', `https://${targetHost}/`);
            } catch (_) {}
        }

        try {
            // রিকোয়েস্ট পাঠান (রিডাইরেক্ট ফলো সহ)
            const response = await fetch(targetUrl, {
                method: request.method || 'GET',
                headers: headers,
                redirect: 'follow'   // ← PHP-র রিডাইরেক্ট ফলো করবে
            });

            // রেস্পন্স ঠিক আছে কিনা চেক করুন
            if (!response.ok) {
                let errorText = '';
                try { errorText = await response.text(); } catch (_) {}
                return new Response(
                    `❌ সার্ভার এরর (${response.status}): ${response.statusText}\n\n${errorText.substring(0, 300)}`,
                    { status: response.status, headers: { 'Access-Control-Allow-Origin': '*' } }
                );
            }

            // ফাইনাল ইউআরএল (রিডাইরেক্টের পরের ঠিকানা)
            const finalUrl = response.url;
            const contentType = response.headers.get('content-type') || '';

            // M3U8 কিনা চেক করুন
            const isM3u8 = contentType.includes('mpegurl') ||
                           contentType.includes('vnd.apple.mpegurl') ||
                           finalUrl.includes('.m3u8');

            if (isM3u8) {
                const content = await response.text();
                const baseUrl = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);
                
                // সব লিংক রিরাইট করুন (যাতে TS সেগমেন্টও প্রক্সি হয়)
                const lines = content.split('\n');
                const newLines = lines.map(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return line;
                    try {
                        const absolute = new URL(trimmed, baseUrl).href;
                        return `${url.origin}?url=${encodeURIComponent(absolute)}`;
                    } catch {
                        return line;
                    }
                });

                return new Response(newLines.join('\n'), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    }
                });
            }

            // যদি M3U8 না হয় (যেমন HTML বা JSON), তবুও রিটার্ন করুন
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
