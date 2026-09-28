// 51000 -> "₱510.00", for error messages people read.
export const peso = (centavos: number) =>
  `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
