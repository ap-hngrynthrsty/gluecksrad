<?php
require __DIR__ . '/../db.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'POST erforderlich');

$db = getDb();
$body = readJsonBody();
$session = requireSession($db, $body);

$segs = computeSegments($db, $session['id']);
if (count($segs) < 2) jsonError(400, 'not enough votes');

$totalV = array_sum(array_map(fn($s) => $s['votes'], $segs));
$r = mt_rand(1, $totalV);
$winner = $segs[count($segs) - 1];
foreach ($segs as $s) {
    $r -= $s['votes'];
    if ($r <= 0) { $winner = $s; break; }
}

// Every client (lead + all phones) animates towards this same frozen snapshot,
// so the wheel looks identical everywhere regardless of votes arriving mid-spin.
$spinData = json_encode(['segments' => $segs, 'winner' => $winner]);
$stmt = $db->prepare('UPDATE sessions SET round = round + 1, spin_data = ? WHERE id = ?');
$stmt->execute([$spinData, $session['id']]);

$session['round'] = (int)$session['round'] + 1;
$session['spin_data'] = $spinData;
echo json_encode(publicState($db, $session));
