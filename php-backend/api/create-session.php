<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();

// A new session means the lead abandoned the previous one - delete it (and its
// answers/participants via FK cascade) right away instead of leaving it behind.
$previousCode = strtoupper(trim($body['previousCode'] ?? ''));
if ($previousCode !== '') {
    $db->prepare('DELETE FROM sessions WHERE join_code = ?')->execute([$previousCode]);
}

// Safety net for sessions nobody ever explicitly ended (closed tab etc.).
$db->exec('DELETE FROM sessions WHERE created_at < (NOW() - INTERVAL 48 HOUR)');

do {
    $code = genJoinCode();
    $stmt = $db->prepare('SELECT id FROM sessions WHERE join_code = ?');
    $stmt->execute([$code]);
} while ($stmt->fetch());

$stmt = $db->prepare('INSERT INTO sessions (join_code, question, round) VALUES (?, ?, 0)');
$stmt->execute([$code, '']);

// Counts every freshly started session site-wide (not participants joining
// an existing one via QR code, which never calls this endpoint).
$db->exec("UPDATE stats SET value = value + 1 WHERE stat_key = 'sessions_created'");
$stmt = $db->query("SELECT value FROM stats WHERE stat_key = 'sessions_created'");
$sessionsMilestone = milestoneHit((int)$stmt->fetchColumn());

echo json_encode(['code' => $code, 'sessionsMilestone' => $sessionsMilestone]);
