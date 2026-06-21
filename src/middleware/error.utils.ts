export const isMongoError = (err: any): boolean => {
  return (
    err?.name === "MongoServerError" ||
    err?.name === "ValidationError" ||
    err?.name === "CastError" ||
    err?.code === 11000
  );
};
