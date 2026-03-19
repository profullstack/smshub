import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import {
  registerForPushNotifications,
  setupNotificationResponseListener,
  setupNotificationReceivedListener,
} from "@/lib/notifications";
import { registerBackgroundFetch } from "@/lib/background-tasks";
import { initNetworkMonitor } from "@/lib/offline-store";
import { colors } from "@/lib/constants";
import type { Session } from "@supabase/supabase-js";

/**
 * Parse a smshub:// deep link URL and navigate accordingly.
 *
 * Supported formats:
 *   smshub://chat/{conversationId}
 *   smshub://compose?to={phone}
 */
function handleDeepLink(url: string) {
  try {
    const parsed = Linking.parse(url);
    // parsed.hostname = "chat" or "compose", parsed.path = conversationId
    // Or for expo-router style: parsed.path = "chat/abc123"

    if (!parsed) return;

    const fullPath = parsed.hostname
      ? `${parsed.hostname}${parsed.path ? `/${parsed.path}` : ""}`
      : parsed.path || "";

    if (fullPath.startsWith("chat/")) {
      const conversationId = fullPath.replace("chat/", "");
      if (conversationId) {
        router.push(`/chat/${conversationId}`);
      }
    } else if (fullPath === "compose" || parsed.hostname === "compose") {
      // Navigate to inbox and open compose modal
      // Pass phone number as param if provided
      const phone = parsed.queryParams?.to as string | undefined;
      if (phone) {
        // Navigate to inbox with compose intent
        router.push({ pathname: "/(tabs)", params: { composeTo: phone } });
      } else {
        router.push("/(tabs)");
      }
    }
  } catch (err) {
    console.error("[deep-link] Failed to handle URL:", url, err);
  }
}

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

  // Initialize network monitoring for offline support
  useEffect(() => {
    const unsubscribe = initNetworkMonitor();
    return unsubscribe;
  }, []);

  // Register push notifications and background fetch when authenticated
  useEffect(() => {
    if (!session) return;

    registerForPushNotifications().catch(console.error);
    registerBackgroundFetch().catch(console.error);

    const responseSub = setupNotificationResponseListener();
    const receivedSub = setupNotificationReceivedListener();

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [session]);

  // Handle deep links
  useEffect(() => {
    if (!session) return;

    // Handle URL that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Handle URLs while app is running (warm start)
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
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
