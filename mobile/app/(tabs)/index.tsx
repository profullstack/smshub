import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { supabase } from "@/lib/supabase";

interface Conversation {
  id: string;
  last_message_at: string;
  contacts: { phone: string; name: string | null } | null;
}

export default function InboxScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();

    // Realtime subscription
    const channel = supabase
      .channel("conversations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => loadConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadConversations = async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(phone, name)")
      .order("last_message_at", { ascending: false });

    if (data) setConversations(data as Conversation[]);
    setLoading(false);
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity style={styles.item}>
      <Text style={styles.name}>
        {item.contacts?.name || item.contacts?.phone || "Unknown"}
      </Text>
      <Text style={styles.time}>
        {new Date(item.last_message_at).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No conversations yet</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 16,
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    color: "#f9fafb",
    fontSize: 16,
    fontWeight: "500",
  },
  time: {
    color: "#6b7280",
    fontSize: 12,
  },
});
