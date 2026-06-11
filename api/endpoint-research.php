<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const TL_ENDPOINT_RESEARCH_TIMEOUT = 5;
const TL_ENDPOINT_RESEARCH_MAX_PAGES = 4;
const TL_ENDPOINT_RESEARCH_MAX_CANDIDATES = 5;

function tl_json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function tl_read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function tl_clean_text(string $value, int $limit = 180): string
{
    $value = trim(preg_replace('/\s+/', ' ', html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    return function_exists('mb_substr') ? mb_substr($value, 0, $limit) : substr($value, 0, $limit);
}

function tl_is_private_host(string $host): bool
{
    $host = strtolower(trim($host));
    if ($host === '' || $host === 'localhost' || substr($host, -6) === '.local') {
        return true;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
    return false;
}

function tl_valid_public_url(string $url): ?array
{
    $url = trim($url);
    if ($url === '' || preg_match('/[\s<>"\']/', $url)) {
        return null;
    }
    $parts = parse_url($url);
    $scheme = strtolower($parts['scheme'] ?? '');
    $host = $parts['host'] ?? '';
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || tl_is_private_host($host)) {
        return null;
    }
    return $parts;
}

function tl_fetch_url(string $url, string $method = 'GET'): array
{
    if (!tl_valid_public_url($url)) {
        return ['ok' => false, 'status' => 0, 'error' => 'blocked-private-or-invalid-url'];
    }

    $method = strtoupper($method);
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => TL_ENDPOINT_RESEARCH_TIMEOUT,
            CURLOPT_TIMEOUT => TL_ENDPOINT_RESEARCH_TIMEOUT,
            CURLOPT_USERAGENT => 'TrackersLensEndpointResearch/0.1',
            CURLOPT_HTTPHEADER => ['Accept: application/json,text/html,*/*;q=0.8'],
            CURLOPT_NOBODY => $method === 'HEAD',
            CURLOPT_HEADER => true,
        ]);
        $raw = curl_exec($curl);
        $error = curl_error($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
        $headerSize = (int) curl_getinfo($curl, CURLINFO_HEADER_SIZE);
        curl_close($curl);
        if ($raw === false) {
            return ['ok' => false, 'status' => $status, 'error' => $error ?: 'curl-error'];
        }
        return [
            'ok' => $status >= 200 && $status < 400,
            'status' => $status,
            'contentType' => $contentType,
            'body' => $method === 'HEAD' ? '' : substr((string) $raw, $headerSize, 250000),
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'timeout' => TL_ENDPOINT_RESEARCH_TIMEOUT,
            'ignore_errors' => true,
            'header' => "User-Agent: TrackersLensEndpointResearch/0.1\r\nAccept: application/json,text/html,*/*;q=0.8\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    $headers = $http_response_header ?? [];
    $status = 0;
    $contentType = '';
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/i', $header, $match)) {
            $status = (int) $match[1];
        } elseif (stripos($header, 'content-type:') === 0) {
            $contentType = trim(substr($header, 13));
        }
    }
    return [
        'ok' => $body !== false && $status >= 200 && $status < 400,
        'status' => $status,
        'contentType' => $contentType,
        'body' => $method === 'HEAD' ? '' : substr((string) $body, 0, 250000),
        'error' => $body === false ? 'stream-fetch-failed' : '',
    ];
}

function tl_search_pages(string $query): array
{
    $searchUrl = 'https://duckduckgo.com/html/?q=' . rawurlencode($query . ' API endpoint documentation');
    $result = tl_fetch_url($searchUrl);
    if (!$result['ok'] || empty($result['body'])) {
        return [];
    }
    $html = (string) $result['body'];
    preg_match_all('/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/is', $html, $matches, PREG_SET_ORDER);
    $pages = [];
    foreach ($matches as $match) {
        $href = html_entity_decode($match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if (str_starts_with($href, '//')) {
            $href = 'https:' . $href;
        }
        $parts = parse_url($href);
        parse_str($parts['query'] ?? '', $params);
        $url = $params['uddg'] ?? $href;
        if (!tl_valid_public_url($url)) {
            continue;
        }
        $pages[] = [
            'url' => $url,
            'title' => tl_clean_text(strip_tags($match[2]), 120),
        ];
        if (count($pages) >= TL_ENDPOINT_RESEARCH_MAX_PAGES) {
            break;
        }
    }
    return $pages;
}

function tl_extract_endpoint_urls(string $body, string $sourceUrl): array
{
    $decoded = html_entity_decode($body, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    preg_match_all('/https?:\/\/[a-z0-9._~:\/?#\[\]@!$&()*+,;=%{}-]+/i', $decoded, $matches);
    $sourceHost = parse_url($sourceUrl, PHP_URL_HOST) ?: '';
    $docsHosts = ['developers.google.com', 'docs.github.com', 'developer.mozilla.org', 'swagger.io', 'openapi.tools'];
    $urls = [];
    foreach ($matches[0] ?? [] as $url) {
        $url = rtrim($url, ".,;)'\"]");
        if (!tl_valid_public_url($url)) {
            continue;
        }
        $host = parse_url($url, PHP_URL_HOST) ?: '';
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $haystack = strtolower($host . ' ' . $path . ' ' . $url);
        if (preg_match('/(\/auth\/|auth\/|oauth|opensearch|favicon|schema\.org|googleapis\.com\/auth|console\.cloud\.google\.com|accounts\.google\.com|login|signup|pricing)/i', $url)) {
            continue;
        }
        if (preg_match('/\.(svg|png|jpe?g|gif|webp|ico|css|js|woff2?|ttf|map)(\?|$)/i', $path)) {
            continue;
        }
        if (preg_match('/(^|\.)(gstatic|googleusercontent|cloudfront|akamaihd|fastly|jsdelivr|unpkg)\.com$/i', $host) || preg_match('/^cdn\./i', $host)) {
            continue;
        }
        if (preg_match('/^(help|docs|doc|developer|developers|status)\./i', $host) && !preg_match('/\/v\d+(\b|\/|:)/i', $path)) {
            continue;
        }
        $score = 0;
        if (preg_match('/(^api\.|[.-]api\.|api[.-]|weather|data|stream|graphql)/i', $host)) {
            $score += 5;
        }
        if (preg_match('/\/v\d+(\b|\/|:)/i', $path)) {
            $score += 4;
        }
        if (preg_match('/(api|graphql|rest|endpoint|current|conditions|forecast|quote|ticker|search|lookup|feed)/i', $path)) {
            $score += 2;
        }
        if ($sourceHost && $host !== $sourceHost) {
            $score += 1;
        }
        if (in_array(strtolower($host), $docsHosts, true)) {
            $score -= 6;
        }
        if ($sourceHost && $host === $sourceHost && !preg_match('/\/v\d+(\b|\/|:)/i', $path)) {
            $score -= 3;
        }
        if ($score < 4) {
            continue;
        }
        $urls[$url] = max($urls[$url] ?? 0, $score);
    }
    arsort($urls);
    return array_keys($urls);
}

function tl_verify_endpoint(string $url): array
{
    $head = tl_fetch_url($url, 'HEAD');
    $check = $head;
    $method = 'HEAD';
    if (!$head['ok'] && in_array((int) ($head['status'] ?? 0), [0, 405, 501], true)) {
        $check = tl_fetch_url($url, 'GET');
        $method = 'GET';
    }
    $status = (int) ($check['status'] ?? 0);
    $contentType = (string) ($check['contentType'] ?? '');
    $path = parse_url($url, PHP_URL_PATH) ?: '';
    $htmlPage = $check['ok'] && stripos($contentType, 'text/html') !== false && !preg_match('/(openapi|swagger|graphql|\/v\d+(\b|\/|:))/i', $path);
    return [
        'status' => $htmlPage ? 'http-warning' : ($check['ok'] ? 'verified' : ($status > 0 ? 'http-warning' : 'unverified')),
        'ok' => (bool) $check['ok'] && !$htmlPage,
        'httpStatus' => $status ?: null,
        'contentType' => $contentType,
        'method' => $method,
        'reason' => $htmlPage ? "HTTP {$status} · HTML documentation/page, not an API response" : ($status > 0 ? "HTTP {$status}" . ($contentType ? " · {$contentType}" : '') : ($check['error'] ?? 'no response')),
        'checkedAt' => gmdate('c'),
        'verifier' => 'local-helper',
    ];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    tl_json_response(['ok' => false, 'error' => 'POST required'], 405);
}

$body = tl_read_json_body();
$query = tl_clean_text((string) ($body['query'] ?? $body['prompt'] ?? ''), 140);
$queryLength = function_exists('mb_strlen') ? mb_strlen($query) : strlen($query);
if ($query === '' || $queryLength < 3) {
    tl_json_response(['ok' => false, 'error' => 'query required'], 400);
}

$pages = tl_search_pages($query);
$candidates = [];
foreach ($pages as $page) {
    $pageFetch = tl_fetch_url($page['url']);
    if (!$pageFetch['ok'] || empty($pageFetch['body'])) {
        continue;
    }
    foreach (tl_extract_endpoint_urls((string) $pageFetch['body'], $page['url']) as $endpoint) {
        if (isset($candidates[$endpoint])) {
            continue;
        }
        $verification = tl_verify_endpoint($endpoint);
        $candidates[$endpoint] = [
            'title' => $page['title'] ?: parse_url($endpoint, PHP_URL_HOST),
            'endpoint' => $endpoint,
            'method' => 'GET',
            'sourceUrl' => $page['url'],
            'reason' => 'Discovered from public documentation by the local endpoint research helper.',
            'confidence' => $verification['ok'] ? 'verified-source' : 'source-discovered',
            'sourceConfidence' => 'local-helper',
            'verification' => $verification,
        ];
        if (count($candidates) >= TL_ENDPOINT_RESEARCH_MAX_CANDIDATES) {
            break 2;
        }
    }
}

tl_json_response([
    'ok' => true,
    'source' => 'local-helper',
    'query' => $query,
    'pages' => $pages,
    'candidates' => array_values($candidates),
]);
