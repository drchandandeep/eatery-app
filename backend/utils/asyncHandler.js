// utils/asyncHandler.js
// Express (v4, which this project uses) does not automatically catch
// rejected Promises from async route handlers -- an unhandled rejection
// would just hang the request instead of returning an error. Wrapping every
// async handler with this forwards any thrown/rejected error to Express's
// error-handling middleware in server.js, so a failed database call always
// results in a clean 500 response instead of a silently hung request.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
