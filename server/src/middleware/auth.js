export const requireAuth = (authService) => (req, res, next) => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token || !authService.validateAccessToken(token)) {
    res.status(401).json({
      ok: false,
      code: "SESSION_EXPIRED",
      message: "Session is invalid or expired."
    });
    return;
  }

  next();
};
