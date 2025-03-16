import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Icons } from '../../../components/Icons';
import { useTheme } from '../../../lib/ThemeContext';

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string;
  };
}

interface ChatUser {
  id: string;
  username: string;
  avatar_url: string;
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
}

export default function Messages() {
  const params = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadUsers();
    const subscription = supabase
      .channel('chat')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, handleNewMessage)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Check if we have userId and username from params (coming from profile page)
    if (params.userId && params.username) {
      const userFromParams: ChatUser = {
        id: params.userId as string,
        username: params.username as string,
        avatar_url: null,
      };
      
      // Check if this user is already in our users list
      const existingUser = users.find(u => u.id === userFromParams.id);
      if (existingUser) {
        setSelectedUser(existingUser);
      } else {
        // Add this user to our list and select them
        setUsers(prev => [...prev, userFromParams]);
        setSelectedUser(userFromParams);
      }
    }
  }, [params, users]);

  useEffect(() => {
    if (selectedUser) {
      loadMessages(selectedUser.id);
    }
  }, [selectedUser]);

  async function ensureProfile(userId: string | null) {
    if (!userId) {
      return { username: 'Unknown User', avatar_url: null };
    }

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', userId)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ 
              id: userId,
              username: `user_${userId.substring(0, 8)}`,
              avatar_url: null
            }])
            .select('username, avatar_url')
            .single();

          if (insertError) throw insertError;
          return newProfile;
        }
        throw profileError;
      }

      return profile || { username: `user_${userId.substring(0, 8)}`, avatar_url: null };
    } catch (error) {
      console.error('Error ensuring profile:', error);
      return { username: `user_${userId.substring(0, 8)}`, avatar_url: null };
    }
  }

  async function loadUsers() {
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      const userMap = new Map<string, ChatUser>();

      for (const message of messages || []) {
        const isReceived = message.receiver_id === user.id;
        const otherUserId = isReceived ? message.sender_id : message.receiver_id;

        if (!userMap.has(otherUserId)) {
          const profile = await ensureProfile(otherUserId);
          
          userMap.set(otherUserId, {
            id: otherUserId,
            username: profile.username,
            avatar_url: profile.avatar_url,
            last_message: message.content,
            last_message_time: message.created_at,
            unread_count: isReceived && !message.read ? 1 : 0,
          });
        } else if (new Date(message.created_at) > new Date(userMap.get(otherUserId)!.last_message_time!)) {
          const existingUser = userMap.get(otherUserId)!;
          userMap.set(otherUserId, {
            ...existingUser,
            last_message: message.content,
            last_message_time: message.created_at,
            unread_count: isReceived && !message.read 
              ? (existingUser.unread_count || 0) + 1 
              : existingUser.unread_count,
          });
        }
      }

      setUsers(Array.from(userMap.values()));
    } catch (error) {
      console.error('Error loading users:', error);
      setError('Failed to load chats');
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(userId: string) {
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      const messagesWithProfiles = await Promise.all(
        (messages || []).map(async (message) => {
          const senderProfile = await ensureProfile(message.sender_id);
          return {
            ...message,
            profiles: senderProfile
          };
        })
      );

      setMessages(messagesWithProfiles);
      
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('receiver_id', user.id)
        .eq('sender_id', userId);

    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load messages');
    }
  }

  function handleNewMessage(payload: any) {
    const newMessage = payload.new;
    if (selectedUser && (
      (newMessage.sender_id === selectedUser.id) || 
      (newMessage.receiver_id === selectedUser.id)
    )) {
      setMessages(prev => [...prev, newMessage]);
      flatListRef.current?.scrollToEnd();
    }
    loadUsers();
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedUser) return;

    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: sendError } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: selectedUser.id,
          content: newMessage.trim(),
        });

      if (sendError) throw sendError;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days}d ago`;
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  function navigateToProfile(userId: string) {
    router.push(`/profile/${userId}`);
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        {selectedUser ? (
          <>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => setSelectedUser(null)}
            >
              <Icons.back size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerProfile}
              onPress={() => navigateToProfile(selectedUser.id)}
            >
              {selectedUser.avatar_url ? (
                <Image 
                  source={{ uri: selectedUser.avatar_url }} 
                  style={styles.headerAvatar} 
                />
              ) : (
                <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                  <Icons.user size={20} color={colors.primary} />
                </View>
              )}
              <Text style={[styles.headerUsername, { color: colors.text }]}>
                {selectedUser.username}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerButton, { backgroundColor: colors.primaryLight }]}
              onPress={() => navigateToProfile(selectedUser.id)}
            >
              <Icons.user size={20} color={colors.primary} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Messages</Text>
            <TouchableOpacity style={[styles.newMessageButton, { backgroundColor: colors.primaryLight }]}>
              <Icons.send size={20} color={colors.primary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {!selectedUser ? (
        <>
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <Icons.search size={20} color={colors.placeholder} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search messages"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.placeholder}
            />
          </View>

          <FlatList
            data={users}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.userItem, { backgroundColor: colors.card }]}
                onPress={() => setSelectedUser(item)}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                    <Icons.user size={24} color={colors.primary} />
                  </View>
                )}
                <View style={styles.userInfo}>
                  <View style={styles.userHeader}>
                    <Text style={[styles.username, { color: colors.text }]}>
                      {item.username}
                    </Text>
                    {item.last_message_time && (
                      <Text style={[styles.timestamp, { color: colors.subtext }]}>
                        {formatTime(item.last_message_time)}
                      </Text>
                    )}
                  </View>
                  {item.last_message && (
                    <Text 
                      style={[styles.lastMessage, { color: colors.subtext }]}
                      numberOfLines={1}
                    >
                      {item.last_message}
                    </Text>
                  )}
                </View>
                {item.unread_count ? (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.unreadCount}>{item.unread_count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.userList}
          />
        </>
      ) : (
        <KeyboardAvoidingView 
          style={styles.chatContainer} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            renderItem={({ item }) => {
              const isOwnMessage = item.sender_id === selectedUser.id;
              return (
                <View style={[
                  styles.messageContainer,
                  isOwnMessage ? styles.receivedMessage : styles.sentMessage
                ]}>
                  {isOwnMessage && (
                    <TouchableOpacity
                      onPress={() => navigateToProfile(item.sender_id)}
                      style={styles.messageAvatar}
                    >
                      {item.profiles.avatar_url ? (
                        <Image 
                          source={{ uri: item.profiles.avatar_url }} 
                          style={styles.messageAvatarImage} 
                        />
                      ) : (
                        <View style={[styles.messageAvatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
                          <Icons.user size={16} color={colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  <View style={[
                    styles.messageBubble,
                    isOwnMessage 
                      ? [styles.receivedBubble, { backgroundColor: colors.primaryLight }]
                      : [styles.sentBubble, { backgroundColor: colors.primary }]
                  ]}>
                    <Text style={[
                      styles.messageText,
                      { color: isOwnMessage ? colors.text : 'white' }
                    ]}>
                      {item.content}
                    </Text>
                  </View>
                  <Text style={[styles.messageTime, { color: colors.subtext }]}>
                    {formatTime(item.created_at)}
                  </Text>
                </View>
              );
            }}
          />

          <View style={[styles.inputContainer, { backgroundColor: colors.card }]}>
            <TextInput
              style={[styles.input, { 
                backgroundColor: colors.background,
                color: colors.text,
              }]}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <TouchableOpacity 
              style={[
                styles.sendButton,
                { backgroundColor: colors.primary },
                (!newMessage.trim() || sending) && { opacity: 0.5 }
              ]}
              onPress={sendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Icons.send size={20} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerUsername: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newMessageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
  },
  userList: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
  },
  lastMessage: {
    fontSize: 14,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCount: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
  },
  messageList: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 16,
    maxWidth: '80%',
  },
  sentMessage: {
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageAvatar: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  messageAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  messageAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 4,
  },
  sentBubble: {
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 12,
    marginTop: 2,
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    marginRight: 12,
    padding: 12,
    borderRadius: 24,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});