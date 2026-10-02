import { Router } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { NotificationService } from "../services/notificationService";

export const notificationRouter = Router();
notificationRouter.use(authMiddleware);

notificationRouter.get("/", (req: AuthenticatedRequest, res) => {
  const notifications = NotificationService.list(req.user!.userId);
  res.json({
    notifications,
    unread: notifications.filter((notification) => !notification.readAt).length,
  });
});

notificationRouter.get("/preferences", (req: AuthenticatedRequest, res) => {
  res.json({ preferences: NotificationService.preferences(req.user!.userId) });
});

notificationRouter.put("/preferences", (req: AuthenticatedRequest, res) => {
  const preferences = NotificationService.updatePreferences(req.user!.userId, req.body || {});
  res.json({ preferences });
});

notificationRouter.post("/:id/read", (req: AuthenticatedRequest, res) => {
  try {
    res.json({ notification: NotificationService.markRead(req.user!.userId, req.params.id) });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Notification not found" });
  }
});
