-- Serial terminal settings (JSON `SerialConfig`); NULL reads as the default.
ALTER TABLE projects ADD COLUMN serial TEXT;
