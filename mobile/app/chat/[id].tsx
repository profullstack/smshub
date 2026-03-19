import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/api";
import { colors, spacing } from "@/lib/constants";

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  created_at: string;
}

interface ConversationInfo {
  id: string;
  phone_number_id: string;
  contacts: { phone: string; name: string | null } | null;
  phone_numbers: { number: string } | null;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [convoInfo, setConvoInfo] = useState<ConversationInfo | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load conversation info
  useEffect(() => {
    if (!id) return;

    const loadConvoInfo = async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*, contacts(phone, name), phone_numbers(number)")
        .eq("id", id)
        .single();
      if (data) setConvoInfo(data as ConversationInfo);
    };

    loadConvoInfo();
  }, [id]);

  // Load messages
  useEffect(() => {
    if (!id) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (data) setMessages(data as Message[]);
      setLoading(false);
    };

    loadMessages();

    // Realtime subscription for new messages in this conversation
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !convoInfo || sending) return;

    const text = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      await sendMessage({
        to: convoInfo.contacts?.phone || "",
        phoneNumberId: convoInfo.phone_number_id,
        message: text,
      });
    } catch (error: any) {
      Alert.alert("Send failed", error.message || "Could not send message");
      setInputText(text); // Restore text on failure
    } finally {
      setSending(false);
    }
  }, [inputText, convoInfo, sending]);

  const contactName =
    convoInfo?.contacts?.name || convoInfo?.contacts?.phone || "Chat";

  const renderMessage = ({ item }: { item: Message }) => {
    const isOutbound = item.direction === "outbound";
    return (
      <View
        style={[
          styles.bubbleRow,
          isOutbound ? styles.bubbleRowRight : styles.bubbleRowLeft,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isOutbound ? styles.bubbleOutbound : styles.bubbleInbound,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              isOutbound
                ? styles.bubbleTextOutbound
                : styles.bubbleTextInbound,
            ]}
          >
            {item.body}
          </Text>
          <View style={styles.bubbleMeta}>
            <Text style={styles.bubbleTime}>
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {isOutbound && item.status === "failed" && (
              <Text style={styles.failedBadge}>Failed</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: contactName }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.blueLight} size="large" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: contactName,
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Send a message to start</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1600}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 13,
  },
  messageList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bubbleRow: {
    marginBottom: spacing.sm,
    flexDirection: "row",
  },
  bubbleRowLeft: {
    justifyContent: "flex-start",
  },
  bubbleRowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOutbound: {
    backgroundColor: colors.bubbleOutbound,
    borderBottomRightRadius: 4,
  },
  bubbleInbound: {
    backgroundColor: colors.bubbleInbound,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bubbleTextOutbound: {
    color: colors.bubbleOutboundText,
  },
  bubbleTextInbound: {
    color: colors.bubbleInboundText,
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  bubbleTime: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  failedBadge: {
    fontSize: 11,
    color: colors.redLight,
    fontWeight: "600",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    color: colors.text,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
