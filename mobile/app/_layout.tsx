import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import {
  registerForPushNotifications,
  setupNotificationResponseListener,
  setupNotificationReceivedListener,
} from "@/lib/notifications";
import { colors } from "@/lib/constants";
import type { Session } from "@supabase/supabase-js";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register push notifications when authenticated
  useEffect(() => {
    if (!session) return;

    registerForPushNotifications().catch(console.error);

    const responseSub = setupNotificationResponseListener();
    const receivedSub = setupNotificationReceivedListener();

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [session]);

  if (loading) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {session ? (
        <>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="chat/[id]"
            options={{
              headerBackTitle: "Back",
            }}
          />
        </>
      ) : (
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      )}
    </Stack>
  );
}
