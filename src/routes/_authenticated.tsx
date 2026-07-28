import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  // Request permissions, create channel and subscribe to Realtime new tasks
  useEffect(() => {
    if (!session?.user) return;

    const setupNotifications = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          const permission = await LocalNotifications.checkPermissions();
          if (permission.display !== "granted") {
            await LocalNotifications.requestPermissions();
          }
          
          // Register standard high importance Android channel
          await LocalNotifications.createChannel({
            id: "tasks-channel",
            name: "Novas Tarefas",
            description: "Notifica quando você recebe uma nova tarefa de um supervisor",
            importance: 5, // max importance (heads up)
            visibility: 1, // public
            sound: "default",
            vibration: true,
          });
        } else if ("Notification" in window) {
          if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            await Notification.requestPermission();
          }
        }
      } catch (err) {
        console.error("LocalNotifications setup error:", err);
      }
    };
    setupNotifications();

    const userId = session.user.id;
    const channel = supabase
      .channel("new-tasks-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
        },
        async (payload) => {
          const newTask = payload.new;
          // Notify if task is assigned to this user AND created by someone else
          if (newTask && newTask.assignee_id === userId && newTask.created_by !== userId) {
            try {
              if (Capacitor.isNativePlatform()) {
                const { LocalNotifications } = await import("@capacitor/local-notifications");
                await LocalNotifications.schedule({
                  notifications: [
                    {
                       id: Math.floor(Math.random() * 100000),
                       title: "Nova Tarefa Atribuída! 📋",
                       body: `"${newTask.title}"\nPrioridade: ${newTask.priority || "Normal"} · Tipo: ${newTask.type || "Geral"}`,
                       channelId: "tasks-channel",
                       sound: "default",
                    },
                  ],
                });
              } else if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Nova Tarefa Atribuída! 📋", {
                  body: `"${newTask.title}"\nPrioridade: ${newTask.priority || "Normal"} · Tipo: ${newTask.type || "Geral"}`,
                });
              }
            } catch (err) {
              console.error("Notification trigger error:", err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user]);

  if (loading || !session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return <Outlet />;
}
