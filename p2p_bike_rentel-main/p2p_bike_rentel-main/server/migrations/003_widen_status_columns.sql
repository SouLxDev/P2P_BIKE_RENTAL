-- Booking and payment statuses such as 'paid_pending_confirmation' (25 chars)
-- do not fit the original VARCHAR(20) columns, which made payment verification fail.
ALTER TABLE bookings ALTER COLUMN status TYPE VARCHAR(40);
ALTER TABLE payments ALTER COLUMN status TYPE VARCHAR(40);
