<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);
$deviceId = mb_substr(trim($body['deviceId'] ?? ''), 0, 64);
$name = mb_substr(trim($body['name'] ?? ''), 0, 40);
$answerId = (int)($body['answerId'] ?? 0);

if ($deviceId === '' || $name === '') jsonError(400, 'invalid vote');

$stmt = $db->prepare('SELECT id FROM answers WHERE id = ? AND session_id = ?');
$stmt->execute([$answerId, $session['id']]);
if (!$stmt->fetch()) jsonError(400, 'invalid vote');

$stmt = $db->prepare('SELECT id FROM participants WHERE session_id = ? AND device_id = ?');
$stmt->execute([$session['id'], $deviceId]);
$existing = $stmt->fetch();

if ($existing) {
    $stmt = $db->prepare('UPDATE participants SET name = ?, answer_id = ? WHERE id = ?');
    $stmt->execute([$name, $answerId, $existing['id']]);
} else {
    $stmt = $db->prepare('INSERT INTO participants (session_id, device_id, name, answer_id) VALUES (?, ?, ?, ?)');
    $stmt->execute([$session['id'], $deviceId, $name, $answerId]);
}

echo json_encode(publicState($db, $session));
