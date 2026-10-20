CREATE DATABASE IF NOT EXISTS cspc_spacehub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cspc_spacehub;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'faculty', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('Active', 'Inactive', 'Pending') NOT NULL DEFAULT 'Active',
  terms_accepted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rooms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  type ENUM('Room', 'Laboratory') NOT NULL,
  building VARCHAR(100) DEFAULT NULL,
  floor VARCHAR(30) DEFAULT NULL,
  capacity INT UNSIGNED NOT NULL,
  air_conditioned BOOLEAN NOT NULL DEFAULT FALSE,
  has_computers BOOLEAN NOT NULL DEFAULT FALSE,
  computer_count INT UNSIGNED NOT NULL DEFAULT 0,
  description TEXT,
  status ENUM('Available', 'Unavailable', 'Maintenance') NOT NULL DEFAULT 'Available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_type_status (type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_no VARCHAR(50) NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  room_id INT UNSIGNED NOT NULL,
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  purpose VARCHAR(100) NOT NULL,
  purpose_details TEXT NOT NULL,
  number_of_users INT UNSIGNED NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed') NOT NULL DEFAULT 'Pending',
  rejection_reason TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_reservation_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_reservation_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE RESTRICT,

  INDEX idx_reservation_room_date (room_id, reservation_date),
  INDEX idx_reservation_user_status (user_id, status),
  INDEX idx_reservation_date_status (reservation_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notification_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_notification_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE facility_maintenance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_maintenance_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_maintenance_room_dates (room_id, start_date, end_date, status),
  INDEX idx_maintenance_dates (start_date, end_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(64) NULL,
  details TEXT NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_user (user_id, created_at),
  INDEX idx_audit_entity (entity_type, entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO rooms
(name, type, building, floor, capacity, air_conditioned, has_computers, computer_count, description)
VALUES
('Room 1', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
('Room 2', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
('Room 3', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
('Room 4', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
('Room 5', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
('Room 6', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
('Mac Lab', 'Laboratory', 'CCS Building', NULL, 30, TRUE, TRUE, 30, 'Mac computer laboratory for instructor-led classes and technical activities.'),
('IT Lab 1', 'Laboratory', 'CCS Building', NULL, 40, TRUE, TRUE, 40, 'Computer laboratory for instructor-led classes and technical activities.'),
('IT Lab 2', 'Laboratory', 'CCS Building', NULL, 40, TRUE, TRUE, 40, 'Computer laboratory for instructor-led classes and technical activities.'),
('NAS Lab', 'Laboratory', 'CCS Building', NULL, 30, TRUE, TRUE, 30, 'Laboratory for networking, storage, and systems activities.'),
('RISE Lab', 'Laboratory', 'CCS Building', NULL, 30, TRUE, TRUE, 30, 'Research and innovation laboratory for technical and project activities.'),
('CCS Lab', 'Laboratory', 'CCS Building', NULL, 40, TRUE, TRUE, 40, 'Computer laboratory for instructor-led classes and technical activities.');
CREATE TABLE IF NOT EXISTS user_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  reservation_updates BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
