-- Adds Room 1-6 and the CCS laboratories to an existing database.
-- Safe to run more than once: rooms.name is UNIQUE, so INSERT IGNORE skips any that already exist.
-- Existing facilities (and their reservations) are not changed or removed.
-- Capacities and PC counts are placeholders: adjust them under Admin > Manage Facilities.
USE cspc_spacehub;

INSERT IGNORE INTO rooms
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
