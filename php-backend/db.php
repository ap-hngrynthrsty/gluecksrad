<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function jsonError($status, $message) {
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

function readJsonBody() {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function getDb() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $configFile = __DIR__ . '/config.php';
    if (!file_exists($configFile)) jsonError(500, 'config.php fehlt - siehe config.example.php');
    $cfg = require $configFile;
    try {
        $pdo = new PDO(
            "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4",
            $cfg['db_user'],
            $cfg['db_pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    } catch (PDOException $e) {
        jsonError(500, 'Datenbankverbindung fehlgeschlagen: ' . $e->getMessage());
    }
    return $pdo;
}

function genJoinCode() {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
    $code = '';
    for ($i = 0; $i < 6; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    return $code;
}

function requireSession($db, $body = []) {
    $code = strtoupper(trim($_GET['code'] ?? $body['code'] ?? ''));
    if ($code === '') jsonError(400, 'code fehlt');
    $stmt = $db->prepare('SELECT * FROM sessions WHERE join_code = ?');
    $stmt->execute([$code]);
    $session = $stmt->fetch();
    if (!$session) jsonError(404, 'Session nicht gefunden');
    return $session;
}

function voteCounts($db, $sessionId) {
    $stmt = $db->prepare('SELECT answer_id, COUNT(*) AS n FROM participants WHERE session_id = ? GROUP BY answer_id');
    $stmt->execute([$sessionId]);
    $votes = [];
    foreach ($stmt->fetchAll() as $row) $votes[$row['answer_id']] = (int)$row['n'];
    return $votes;
}

function getAnswers($db, $sessionId) {
    $stmt = $db->prepare('SELECT * FROM answers WHERE session_id = ? ORDER BY position ASC, id ASC');
    $stmt->execute([$sessionId]);
    return $stmt->fetchAll();
}

function getVoters($db, $sessionId, $answerId) {
    $stmt = $db->prepare('SELECT id, name FROM participants WHERE session_id = ? AND answer_id = ?');
    $stmt->execute([$sessionId, $answerId]);
    return $stmt->fetchAll();
}

// Only answers with a real vote become a wheel segment - same rule as the other two apps.
function computeSegments($db, $sessionId) {
    $answers = getAnswers($db, $sessionId);
    $votes = voteCounts($db, $sessionId);
    $totalV = 0;
    foreach ($answers as $a) $totalV += $votes[$a['id']] ?? 0;
    $segs = [];
    if ($totalV === 0) return $segs;
    $acc = 0;
    foreach ($answers as $i => $a) {
        $v = $votes[$a['id']] ?? 0;
        if ($v <= 0) continue;
        $f0 = $acc / $totalV; $acc += $v; $f1 = $acc / $totalV;
        $segs[] = [
            'id' => (int)$a['id'], 'number' => $i + 1, 'label' => $a['label'],
            'votes' => $v, 'pct' => (int)round($v / $totalV * 100), 'f0' => $f0, 'f1' => $f1
        ];
    }
    return $segs;
}

function publicState($db, $session) {
    $sessionId = $session['id'];
    $answers = getAnswers($db, $sessionId);
    $votes = voteCounts($db, $sessionId);
    $answersOut = [];
    foreach ($answers as $i => $a) {
        $answersOut[] = [
            'id' => (int)$a['id'], 'number' => $i + 1, 'label' => $a['label'],
            'votes' => $votes[$a['id']] ?? 0,
            'voters' => array_map(fn($v) => ['id' => (int)$v['id'], 'name' => $v['name']], getVoters($db, $sessionId, $a['id']))
        ];
    }
    $stmt = $db->prepare('SELECT COUNT(*) AS n FROM participants WHERE session_id = ?');
    $stmt->execute([$sessionId]);
    $participantsCount = (int)$stmt->fetch()['n'];

    return [
        'code' => $session['join_code'],
        'question' => $session['question'],
        'answers' => $answersOut,
        'segments' => computeSegments($db, $sessionId),
        'participantsCount' => $participantsCount,
        'round' => (int)$session['round'],
        'spin' => $session['spin_data'] ? json_decode($session['spin_data'], true) : null
    ];
}
