import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { router } from "expo-router";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and store the token in Supabase
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });
  const pushToken = tokenData.data;

  // Configure Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563eb",
    });
  }

  // Store token in Supabase
  await storePushToken(pushToken);

  return pushToken;
}

/**
 * Store push token in Supabase push_tokens table
 */
async function storePushToken(token: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // Upsert the token (insert or update if exists for this user+platform)
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform" }
  );

  if (error) {
    console.error("Error storing push token:", error);
  }
}

/**
 * Set up notification response handler (tap on notification)
 */
export function setupNotificationResponseListener() {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;

      // Navigate to conversation if conversation_id is in the payload
      if (data?.conversation_id) {
        router.push(`/chat/${data.conversation_id}`);
      }
    }
  );

  return subscription;
}

/**
 * Set up listener for notifications received while app is foregrounded
 */
export function setupNotificationReceivedListener(
  callback?: (notification: Notifications.Notification) => void
) {
  const subscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      callback?.(notification);
    }
  );

  return subscription;
}

/**
 * Remove push token on logout
 */
export async function removePushToken() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", Platform.OS);
}
