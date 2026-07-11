<?php
require __DIR__ . '/../db.php';
$db = getDb();

$heartsMilestone = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = readJsonBody();
    if (($body['action'] ?? '') === 'heart') {
        $db->exec("UPDATE stats SET value = value + 1 WHERE stat_key = 'hearts_given'");
        $stmt = $db->query("SELECT value FROM stats WHERE stat_key = 'hearts_given'");
        // Only the request that actually causes the crossing gets the
        // celebration flag - a plain GET poll never checks this.
        $heartsMilestone = milestoneHit((int)$stmt->fetchColumn());
    }
}

$stmt = $db->query("SELECT stat_key, value FROM stats");
$out = [];
foreach ($stmt->fetchAll() as $row) $out[$row['stat_key']] = (int)$row['value'];

echo json_encode([
    'sessionsCreated' => $out['sessions_created'] ?? 0,
    'heartsGiven' => $out['hearts_given'] ?? 0,
    'heartsMilestone' => $heartsMilestone
]);
