<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);
$action = $body['action'] ?? 'add';

if ($action === 'add') {
    $label = mb_substr(trim($body['label'] ?? ''), 0, 80);
    $stmt = $db->prepare('SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM answers WHERE session_id = ?');
    $stmt->execute([$session['id']]);
    $nextPos = $stmt->fetch()['nextPos'];
    $stmt = $db->prepare('INSERT INTO answers (session_id, label, position) VALUES (?, ?, ?)');
    $stmt->execute([$session['id'], $label, $nextPos]);
} elseif ($action === 'rename') {
    $id = (int)($body['id'] ?? 0);
    $label = mb_substr(trim($body['label'] ?? ''), 0, 80);
    $stmt = $db->prepare('UPDATE answers SET label = ? WHERE id = ? AND session_id = ?');
    $stmt->execute([$label, $id, $session['id']]);
} elseif ($action === 'delete') {
    $id = (int)($body['id'] ?? 0);
    $stmt = $db->prepare('DELETE FROM answers WHERE id = ? AND session_id = ?');
    $stmt->execute([$id, $session['id']]);
} else {
    jsonError(400, 'unbekannte action');
}

echo json_encode(publicState($db, $session));
