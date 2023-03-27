export const addMonthsUTC = (date: Date, monthsToAdd: number): Date => {
  // Make a copy of the date object so we don't overwrite it
  const newDate = new Date(date);
  newDate.setUTCMonth(newDate.getUTCMonth() + monthsToAdd);
  return newDate;
};

/**
 * Convert data into ISO 8601 formatted date string. This has the advantage of being human readable
 * and should save on storage vs. storing the whole timestamp.
 * @param date - Date
 * @returns - Date string
 */
export const convertDateToDateString = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

// Source: https://github.com/bmaupin/langtrends/blob/master/src/helpers/ApiHelper.js
export const subtractMonthsUTC = (
  date: Date,
  monthsToSubtract: number
): Date => {
  // Make a copy of the date object so we don't overwrite it
  const newDate = new Date(date);
  newDate.setUTCMonth(newDate.getUTCMonth() - monthsToSubtract);
  return newDate;
};
