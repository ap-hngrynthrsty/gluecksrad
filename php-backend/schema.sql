CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  join_code VARCHAR(8) NOT NULL UNIQUE,
  question VARCHAR(300) NOT NULL DEFAULT '',
  round INT NOT NULL DEFAULT 0,
  spin_data TEXT NULL,
  allow_participant_answers TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  label VARCHAR(80) NOT NULL DEFAULT '',
  position INT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  device_id VARCHAR(64) NULL,
  name VARCHAR(40) NOT NULL,
  answer_id INT NOT NULL,
  UNIQUE KEY uniq_device_per_session (session_id, device_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Site-wide counters (not per-session): total sessions ever started, and
-- total hearts/likes given across all users.
CREATE TABLE IF NOT EXISTS stats (
  stat_key VARCHAR(30) PRIMARY KEY,
  value BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
