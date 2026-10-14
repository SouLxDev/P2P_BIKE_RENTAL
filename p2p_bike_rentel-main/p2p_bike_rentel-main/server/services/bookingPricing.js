const PLATFORM_FEE_RATE = Number(process.env.PLATFORM_FEE_RATE || 0.15);

const calculateBookingAmounts = ({ startDate, endDate, pricePerDay }) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid booking dates');
  }

  if (end < start) {
    throw new Error('End date cannot be before start date');
  }

  const diffTime = Math.abs(end - start);
  const rentalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const totalPrice = Number((rentalDays * Number(pricePerDay)).toFixed(2));
  const platformFee = Number((totalPrice * PLATFORM_FEE_RATE).toFixed(2));
  const ownerAmount = Number((totalPrice - platformFee).toFixed(2));

  return {
    rentalDays,
    totalPrice,
    platformFee,
    ownerAmount,
  };
};

module.exports = {
  calculateBookingAmounts,
  PLATFORM_FEE_RATE,
};
