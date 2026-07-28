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
  const { session, loading, isSupervisor } = useAuth();
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

    const triggerLocalNotification = async (title: string, body: string) => {
      try {
        if (Capacitor.isNativePlatform()) {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          await LocalNotifications.schedule({
            notifications: [
              {
                id: Math.floor(Math.random() * 100000),
                title,
                body,
                channelId: "tasks-channel",
                sound: "default",
              },
            ],
          });
        } else if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, { body });
        }
      } catch (err) {
        console.error("Failed to trigger local notification:", err);
      }
    };

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
          if (!newTask) return;

          if (isSupervisor) {
            if (newTask.created_by !== userId) {
              try {
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("name")
                  .eq("id", newTask.created_by)
                  .single();
                const name = profile?.name || "Funcionário";
                triggerLocalNotification(
                  "Nova Tarefa Criada! 📋",
                  `"${newTask.title}" foi criada por ${name}.`
                );
              } catch (err) {
                console.error(err);
              }
            }
          } else {
            if (newTask.assignee_id === userId && newTask.created_by !== userId) {
              triggerLocalNotification(
                "Nova Tarefa Atribuída! 📋",
                `"${newTask.title}"\nPrioridade: ${newTask.priority || "Normal"} · Tipo: ${newTask.type || "Geral"}`
              );
            }
          }
        }
      );

    if (isSupervisor) {
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
        },
        async (payload) => {
          const oldTask = payload.old;
          const newTask = payload.new;
          if (!newTask) return;

          // Only notify supervisor/admin if modified by someone else
          if (newTask.assignee_id && newTask.assignee_id !== userId) {
            try {
              const { data: profile } = await supabase
                .from("profiles")
                .select("name")
                .eq("id", newTask.assignee_id)
                .single();
              const name = profile?.name || "Funcionário";

              // A: Status changed
              if (oldTask && oldTask.status !== newTask.status) {
                const friendlyStatus: Record<string, string> = {
                  pending: "Pendente",
                  in_progress: "Em Andamento",
                  review: "Em Revisão",
                  done: "Concluída",
                };
                const statusName = friendlyStatus[newTask.status] || newTask.status;
                triggerLocalNotification(
                  "Status de Tarefa Alterado! 🔄",
                  `${name} moveu "${newTask.title}" para ${statusName}.`
                );
              }

              // B: Photo evidence uploaded
              if (oldTask && oldTask.photo_url !== newTask.photo_url && newTask.photo_url) {
                triggerLocalNotification(
                  "Nova Evidência de Foto! 📸",
                  `${name} anexou foto em "${newTask.title}".`
                );
              }

              // C: Notes added or updated
              if (oldTask && oldTask.notes !== newTask.notes && newTask.notes) {
                triggerLocalNotification(
                  "Nova Observação Adicionada! ✍️",
                  `${name} adicionou nota em "${newTask.title}".`
                );
              }
            } catch (err) {
              console.error(err);
            }
          }
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user, isSupervisor]);

  if (loading || !session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return <Outlet />;
}
