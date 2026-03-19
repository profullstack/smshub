import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/api";
import {
  isOnline,
  onConnectivityChange,
  saveConversations,
  loadConversations as loadCachedConversations,
  queueMessage,
} from "@/lib/offline-store";
import { colors, spacing } from "@/lib/constants";

interface Conversation {
  id: string;
  last_message_at: string;
  phone_number_id: string;
  contacts: { phone: string; name: string | null } | null;
  messages: { body: string; direction: string; created_at: string }[] | null;
}

interface PhoneNumber {
  id: string;
  number: string;
  provider_id: string;
}

export default function InboxScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const [searchQuery, setSearchQuery] = useState("");

  // New conversation modal state
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumber | null>(null);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [sendingNew, setSendingNew] = useState(false);
  const [showNumberPicker, setShowNumberPicker] = useState(false);

  // Monitor connectivity
  useEffect(() => {
    const unsubscribe = onConnectivityChange((isOnlineNow) => {
      setOnline(isOnlineNow);
      if (isOnlineNow) {
        // Refresh from server when back online
        loadConversations();
      }
    });
    return unsubscribe;
  }, []);

  const loadConversations = useCallback(async () => {
    if (!isOnline()) {
      // Load from cache when offline
      const cached = await loadCachedConversations();
      if (cached.length > 0) {
        setConversations(cached as Conversation[]);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data } = await supabase
      .from("conversations")
      .select(
        "*, contacts(phone, name), messages(body, direction, created_at)"
      )
      .order("last_message_at", { ascending: false })
      .order("created_at", {
        ascending: false,
        referencedTable: "messages",
      })
      .limit(1, { referencedTable: "messages" });

    if (data) {
      setConversations(data as Conversation[]);
      // Cache for offline use
      saveConversations(data as Conversation[]).catch(console.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadConversations();

    // Realtime subscription for conversation updates
    const channel = supabase
      .channel("conversations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => loadConversations()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => loadConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConversations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadConversations();
  }, [loadConversations]);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;

    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((conv) => {
      const name = conv.contacts?.name?.toLowerCase() || "";
      const phone = conv.contacts?.phone?.toLowerCase() || "";
      const lastMsg = conv.messages?.[0]?.body?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
    });
  }, [conversations, searchQuery]);

  const openNewConversation = async () => {
    if (!isOnline()) {
      Alert.alert(
        "Offline",
        "You need an internet connection to start a new conversation."
      );
      return;
    }

    // Load user's phone numbers
    const { data } = await supabase
      .from("phone_numbers")
      .select("id, number, provider_id");
    if (data && data.length > 0) {
      setPhoneNumbers(data as PhoneNumber[]);
      setSelectedNumber(data[0] as PhoneNumber);
    } else {
      Alert.alert(
        "No Phone Numbers",
        "You need to configure a phone number in settings first."
      );
      return;
    }
    setRecipientPhone("");
    setFirstMessage("");
    setShowNewConvo(true);
  };

  const handleSendNewConvo = async () => {
    if (!selectedNumber || !recipientPhone.trim() || !firstMessage.trim()) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }

    setSendingNew(true);
    try {
      if (isOnline()) {
        await sendMessage({
          to: recipientPhone.trim(),
          phoneNumberId: selectedNumber.id,
          message: firstMessage.trim(),
        });
      } else {
        // Queue for later
        await queueMessage({
          to: recipientPhone.trim(),
          phoneNumberId: selectedNumber.id,
          message: firstMessage.trim(),
        });
        Alert.alert(
          "Queued",
          "Message will be sent when you're back online."
        );
      }
      setShowNewConvo(false);
      loadConversations();
    } catch (error: any) {
      Alert.alert("Send failed", error.message || "Could not send message");
    } finally {
      setSendingNew(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const lastMsg = item.messages?.[0];
    const previewText = lastMsg
      ? `${lastMsg.direction === "outbound" ? "You: " : ""}${lastMsg.body}`
      : "No messages";
    const hasUnread =
      lastMsg?.direction === "inbound" &&
      new Date(lastMsg.created_at).getTime() > Date.now() - 60000;

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => router.push(`/chat/${item.id}`)}
        activeOpacity={0.6}
      >
        {/* Avatar circle */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(
              item.contacts?.name?.[0] ||
              item.contacts?.phone?.slice(-2) ||
              "?"
            ).toUpperCase()}
          </Text>
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <Text style={styles.name} numberOfLines={1}>
              {item.contacts?.name || item.contacts?.phone || "Unknown"}
            </Text>
            <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
          </View>

          <View style={styles.itemPreviewRow}>
            <Text style={styles.preview} numberOfLines={1}>
              {previewText}
            </Text>
            {hasUnread && <View style={styles.unreadDot} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.blueLight} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Offline indicator */}
      {!online && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            📡 You're offline — showing cached data
          </Text>
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {filteredConversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {searchQuery.trim()
              ? "No matching conversations"
              : "No conversations yet"}
          </Text>
          {!searchQuery.trim() && (
            <Text style={styles.emptySubtext}>
              Tap + to start a new conversation
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.blueLight}
            />
          }
        />
      )}

      {/* FAB - New conversation */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openNewConversation}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* New conversation modal */}
      <Modal
        visible={showNewConvo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNewConvo(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowNewConvo(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Message</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Sender number picker */}
          <Text style={styles.fieldLabel}>From</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowNumberPicker(!showNumberPicker)}
          >
            <Text style={styles.pickerText}>
              {selectedNumber?.number || "Select a number"}
            </Text>
            <Text style={styles.pickerChevron}>▼</Text>
          </TouchableOpacity>

          {showNumberPicker && (
            <View style={styles.pickerDropdown}>
              {phoneNumbers.map((pn) => (
                <TouchableOpacity
                  key={pn.id}
                  style={[
                    styles.pickerOption,
                    pn.id === selectedNumber?.id && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedNumber(pn);
                    setShowNumberPicker(false);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{pn.number}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Recipient */}
          <Text style={styles.fieldLabel}>To</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="+1234567890"
            placeholderTextColor={colors.textMuted}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
          />

          {/* Message */}
          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            style={[styles.modalInput, styles.modalTextarea]}
            placeholder="Type your message..."
            placeholderTextColor={colors.textMuted}
            value={firstMessage}
            onChangeText={setFirstMessage}
            multiline
            maxLength={1600}
          />

          <TouchableOpacity
            style={[
              styles.modalSendButton,
              sendingNew && styles.sendButtonDisabled,
            ]}
            onPress={handleSendNewConvo}
            disabled={sendingNew}
          >
            {sendingNew ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalSendText}>Send Message</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
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

  // Offline banner
  offlineBanner: {
    backgroundColor: "#92400e", // amber-800
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  offlineBannerText: {
    color: "#fef3c7", // amber-100
    fontSize: 13,
    fontWeight: "500",
  },

  // Search bar
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },

  // Conversation item
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  avatarText: {
    color: colors.blueLight,
    fontSize: 18,
    fontWeight: "600",
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
  },
  itemPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  preview: {
    color: colors.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.unreadDot,
    marginLeft: spacing.sm,
  },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    marginTop: -2,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  modalCancel: {
    color: colors.blueLight,
    fontSize: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: 4,
  },
  modalInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontSize: 16,
  },
  modalTextarea: {
    height: 120,
    textAlignVertical: "top",
  },
  modalSendButton: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  modalSendText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Number picker
  pickerButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    color: colors.text,
    fontSize: 16,
  },
  pickerChevron: {
    color: colors.textMuted,
    fontSize: 12,
  },
  pickerDropdown: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  pickerOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionSelected: {
    backgroundColor: colors.surface,
  },
  pickerOptionText: {
    color: colors.text,
    fontSize: 16,
  },
});
