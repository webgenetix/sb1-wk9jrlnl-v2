import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Platform,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, Audio } from 'expo-av';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Icons } from '../../../components/Icons';
import { useTheme } from '../../../lib/ThemeContext';
import { Button } from '../../../components/Button';
import * as Location from 'expo-location';

interface Video {
  id: string;
  title: string;
  description: string;
  video_url: string;
  user_id: string;
  created_at: string;
  like_count: number;
  bookmark_count?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
}

interface VideoUser {
  username: string;
  avatar_url: string;
}

interface VideoInteraction {
  isLiked: boolean;
  isBookmarked: boolean;
}

interface EditVideoData {
  id: string;
  title: string;
  description: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

const useVideoState = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const videoRefs = useRef<{ [key: string]: any }>({});

  const handleViewableItemsChanged = useCallback(({ changed }: { changed: any[] }) => {
    if (changed && changed[0].isViewable) {
      setCurrentIndex(changed[0].index);
    }
  }, []);

  return {
    currentIndex,
    isMuted,
    videoRefs,
    setIsMuted,
    handleViewableItemsChanged,
  };
};

const useInteractionState = () => {
  const [interactions, setInteractions] = useState<{ [key: string]: VideoInteraction }>({});
  const [expandedDescriptions, setExpandedDescriptions] = useState<{ [key: string]: boolean }>({});
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editVideoData, setEditVideoData] = useState<EditVideoData | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return {
    interactions,
    setInteractions,
    expandedDescriptions,
    setExpandedDescriptions,
    bottomSheetVisible,
    setBottomSheetVisible,
    editModalVisible,
    setEditModalVisible,
    editVideoData,
    setEditVideoData,
    locationLoading,
    setLocationLoading,
    locationError,
    setLocationError,
    saving,
    setSaving,
  };
};

const { height: WINDOW_HEIGHT } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 49;
const BOTTOM_INSET = 34;
const DESCRIPTION_MAX_HEIGHT = 100;

// Define VideoPlayer component before using it
function VideoPlayer({ video, isCurrentVideo }: { video: Video & { user: VideoUser }, isCurrentVideo: boolean }) {
  const videoState = useVideoState();
  
  if (Platform.OS === 'web') {
    return (
      <video
        ref={el => {
          if (el) videoState.videoRefs.current[video.id] = el;
        }}
        src={video.video_url}
        style={styles.video}
        loop
        playsInline
        controls={false}
        muted={videoState.isMuted}
        autoPlay={isCurrentVideo}
      />
    );
  }

  return (
    <Video
      ref={ref => {
        if (ref) videoState.videoRefs.current[video.id] = ref;
      }}
      source={{ uri: video.video_url }}
      style={styles.video}
      resizeMode="cover"
      shouldPlay={isCurrentVideo}
      isLooping
      isMuted={videoState.isMuted}
      useNativeControls={false}
    />
  );
}

// Memoize video player component for better performance
const MemoizedVideoPlayer = React.memo(VideoPlayer, (prevProps, nextProps) => {
  return (
    prevProps.isCurrentVideo === nextProps.isCurrentVideo &&
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.video_url === nextProps.video.video_url
  );
});

export default function VideoScroll() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<(Video & { user: VideoUser })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const videoState = useVideoState();
  const interactionState = useInteractionState();

  useEffect(() => {
    setupAudio();
    loadVideos();
    getCurrentUser();
    return () => {
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
      });
    };
  }, []);

  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  }

  async function setupAudio() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Error setting up audio:', error);
    }
  }

  useEffect(() => {
    if (videos.length > 0) {
      videos.forEach((video, index) => {
        const videoRef = videoState.videoRefs.current[video.id];
        if (videoRef) {
          if (index === videoState.currentIndex) {
            if (Platform.OS === 'web') {
              videoRef.play().catch(() => {
                console.log('Web playback error');
              });
            } else {
              videoRef.playAsync?.().catch(() => {
                console.log('Native playback error');
              });
            }
          } else {
            if (Platform.OS === 'web') {
              videoRef.pause();
            } else {
              videoRef.pauseAsync?.().catch(() => {
                console.log('Pause error');
              });
            }
          }
        }
      });
    }
  }, [videoState.currentIndex, videos]);

  const handleLike = useCallback(async (videoId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const isLiked = interactionState.interactions[videoId]?.isLiked;

      if (isLiked) {
        const { error } = await supabase
          .from('video_likes')
          .delete()
          .eq('video_id', videoId)
          .eq('user_id', user.id);

        if (error) throw error;

        setVideos(prev => 
          prev.map(video => 
            video.id === videoId 
              ? { ...video, like_count: video.like_count - 1 }
              : video
          )
        );
      } else {
        const { error } = await supabase
          .from('video_likes')
          .insert({ video_id: videoId, user_id: user.id });

        if (error) throw error;

        setVideos(prev => 
          prev.map(video => 
            video.id === videoId 
              ? { ...video, like_count: video.like_count + 1 }
              : video
          )
        );
      }

      interactionState.setInteractions(prev => ({
        ...prev,
        [videoId]: {
          ...prev[videoId],
          isLiked: !isLiked,
        },
      }));
    } catch (error) {
      console.error('Error handling like:', error);
    }
  }, [interactionState.interactions]);

  const handleBookmark = useCallback(async (videoId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const isBookmarked = interactionState.interactions[videoId]?.isBookmarked;

      if (isBookmarked) {
        const { error } = await supabase
          .from('video_bookmarks')
          .delete()
          .eq('video_id', videoId)
          .eq('user_id', user.id);

        if (error) throw error;

        setVideos(prev => 
          prev.map(video => 
            video.id === videoId 
              ? { ...video, bookmark_count: (video.bookmark_count || 1) - 1 }
              : video
          )
        );
      } else {
        const { error } = await supabase
          .from('video_bookmarks')
          .insert({ video_id: videoId, user_id: user.id });

        if (error) throw error;

        setVideos(prev => 
          prev.map(video => 
            video.id === videoId 
              ? { ...video, bookmark_count: (video.bookmark_count || 0) + 1 }
              : video
          )
        );
      }

      interactionState.setInteractions(prev => ({
        ...prev,
        [videoId]: {
          ...prev[videoId],
          isBookmarked: !isBookmarked,
        },
      }));
    } catch (error) {
      console.error('Error handling bookmark:', error);
    }
  }, [interactionState.interactions]);

  function navigateToProfile(userId: string) {
    router.push(`/profile/${userId}`);
  }

  async function checkUserInteractions(userId: string, videoIds: string[]) {
    try {
      const { data: likedData, error: likedError } = await supabase
        .from('video_likes')
        .select('video_id')
        .eq('user_id', userId)
        .in('video_id', videoIds);

      if (likedError) throw likedError;
      const likedVideos = new Set(likedData.map(like => like.video_id));
      
      const { data: bookmarkedData, error: bookmarkedError } = await supabase
        .from('video_bookmarks')
        .select('video_id')
        .eq('user_id', userId)
        .in('video_id', videoIds);

      if (bookmarkedError) throw bookmarkedError;
      const bookmarkedVideos = new Set(bookmarkedData.map(bookmark => bookmark.video_id));
      
      const newInteractions = {};
      videoIds.forEach(videoId => {
        newInteractions[videoId] = {
          isLiked: likedVideos.has(videoId),
          isBookmarked: bookmarkedVideos.has(videoId),
        };
      });

      interactionState.setInteractions(newInteractions);
    } catch (error) {
      console.error('Error checking user interactions:', error);
    }
  }

  async function ensureProfile(userId: string) {
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
              username: `user_${userId.slice(0, 8)}`,
              avatar_url: null
            }])
            .select('username, avatar_url')
            .single();

          if (insertError) throw insertError;
          return newProfile;
        }
        throw profileError;
      }

      return profile;
    } catch (error) {
      console.warn('Error ensuring profile:', error);
      return { username: `user_${userId.slice(0, 8)}`, avatar_url: null };
    }
  }

  async function loadVideos() {
    try {
      setError(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('*, like_count, bookmark_count')
        .order('created_at', { ascending: false });

      if (videosError) throw videosError;

      const videosWithUsers = await Promise.all(
        videosData.map(async (video) => {
          const userData = await ensureProfile(video.user_id);
          return {
            ...video,
            user: userData
          };
        })
      );

      setVideos(videosWithUsers);

      await checkUserInteractions(user.id, videosData.map(v => v.id));

    } catch (error) {
      console.error('Error loading videos:', error);
      setError('Failed to load videos');
    } finally {
      setLoading(false);
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  const toggleDescription = useCallback((videoId: string) => {
    interactionState.setExpandedDescriptions(prev => ({
      ...prev,
      [videoId]: !prev[videoId]
    }));
  }, []);

  function openBottomSheet(video: Video & { user: VideoUser }) {
    interactionState.setBottomSheetVisible(true);
    interactionState.setEditVideoData({
      id: video.id,
      title: video.title || '',
      description: video.description || '',
      address: video.address || '',
      latitude: video.latitude || null,
      longitude: video.longitude || null,
    });
  }

  function openEditModal() {
    interactionState.setBottomSheetVisible(false);
    interactionState.setEditModalVisible(true);
  }

  async function getCurrentLocation() {
    try {
      interactionState.setLocationLoading(true);
      interactionState.setLocationError(null);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        interactionState.setLocationError('Permission to access location was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const formattedAddress = address ? 
        `${address.street || ''} ${address.name || ''}, ${address.city || ''}, ${address.region || ''} ${address.postalCode || ''}, ${address.country || ''}` 
        : 'Unknown location';
      
      interactionState.setEditVideoData(prev => ({
        ...prev!,
        address: formattedAddress,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }));
    } catch (error) {
      console.error('Error getting location:', error);
      interactionState.setLocationError('Failed to get current location');
    } finally {
      interactionState.setLocationLoading(false);
    }
  }

  async function searchAddress() {
    if (!interactionState.editVideoData?.address.trim()) {
      interactionState.setLocationError('Please enter an address');
      return;
    }

    try {
      interactionState.setLocationLoading(true);
      interactionState.setLocationError(null);

      const geocodeResult = await Location.geocodeAsync(interactionState.editVideoData.address);
      
      if (geocodeResult.length === 0) {
        interactionState.setLocationError('Address not found');
        return;
      }

      const { latitude, longitude } = geocodeResult[0];
      
      interactionState.setEditVideoData(prev => ({
        ...prev!,
        latitude,
        longitude,
      }));
    } catch (error) {
      console.error('Error geocoding address:', error);
      interactionState.setLocationError('Failed to find location');
    } finally {
      interactionState.setLocationLoading(false);
    }
  }

  async function saveVideoChanges() {
    if (!interactionState.editVideoData) return;
    
    try {
      interactionState.setSaving(true);
      
      const { error } = await supabase
        .from('videos')
        .update({
          title: interactionState.editVideoData.title,
          description: interactionState.editVideoData.description,
          address: interactionState.editVideoData.address,
          latitude: interactionState.editVideoData.latitude,
          longitude: interactionState.editVideoData.longitude,
        })
        .eq('id', interactionState.editVideoData.id);

      if (error) throw error;

      setVideos(prev => 
        prev.map(video => 
          video.id === interactionState.editVideoData!.id 
            ? { 
                ...video, 
                title: interactionState.editVideoData!.title,
                description: interactionState.editVideoData!.description,
                address: interactionState.editVideoData!.address,
                latitude: interactionState.editVideoData!.latitude,
                longitude: interactionState.editVideoData!.longitude,
              }
            : video
        )
      );

      interactionState.setEditModalVisible(false);
    } catch (error) {
      console.error('Error updating video:', error);
      interactionState.setLocationError('Failed to update video');
    } finally {
      interactionState.setSaving(false);
    }
  }

  function VideoPlayer({ video, isCurrentVideo }: { video: Video & { user: VideoUser }, isCurrentVideo: boolean }) {
    if (Platform.OS === 'web') {
      return (
        <video
          ref={el => {
            if (el) videoState.videoRefs.current[video.id] = el;
          }}
          src={video.video_url}
          style={styles.video}
          loop
          playsInline
          controls={false}
          muted={videoState.isMuted}
          autoPlay={isCurrentVideo}
        />
      );
    }

    return (
      <Video
        ref={ref => {
          if (ref) videoState.videoRefs.current[video.id] = ref;
        }}
        source={{ uri: video.video_url }}
        style={styles.video}
        resizeMode="cover"
        shouldPlay={isCurrentVideo}
        isLooping
        isMuted={videoState.isMuted}
        useNativeControls={false}
      />
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        <TouchableOpacity onPress={loadVideos} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const adjustedHeight = WINDOW_HEIGHT - TAB_BAR_HEIGHT - (Platform.OS === 'ios' ? insets.bottom : 0);
  const currentVideo = videos[videoState.currentIndex];
  const isCurrentUserVideo = currentVideo && currentUserId === currentVideo.user_id;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        windowSize={3}
        ref={flatListRef}
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.videoContainer, { height: adjustedHeight }]}>
            <MemoizedVideoPlayer 
              video={item} 
              isCurrentVideo={videoState.currentIndex === videos.indexOf(item)} 
            />
            
            <View style={styles.overlay}>
              <View style={styles.videoInfo}>
                <TouchableOpacity 
                  onPress={() => navigateToProfile(item.user_id)}
                >
                  <Text style={styles.username}>@{item.user.username}</Text>
                </TouchableOpacity>

                <ScrollView 
                  style={[
                    styles.descriptionContainer,
                    !interactionState.expandedDescriptions[item.id] && { maxHeight: DESCRIPTION_MAX_HEIGHT }
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.description}>
                    {item.description || item.title || 'No description'}
                  </Text>
                  
                  {item.address && (
                    <View style={styles.locationInfo}>
                      <Icons.mapPin size={14} color="white" style={styles.locationIcon} />
                      <Text style={styles.locationText}>{item.address}</Text>
                    </View>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.readMoreButton}
                  onPress={() => toggleDescription(item.id)}
                >
                  <Text style={styles.readMoreText}>
                    {interactionState.expandedDescriptions[item.id] ? 'Show less' : 'Read more'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sideActions}>
                <TouchableOpacity 
                  style={styles.profileButton}
                  onPress={() => navigateToProfile(item.user_id)}
                >
                  {item.user.avatar_url ? (
                    <Image 
                      source={{ uri: item.user.avatar_url }} 
                      style={styles.profileImage} 
                    />
                  ) : (
                    <View style={styles.profilePlaceholder}>
                      <Icons.user size={20} color={colors.placeholder} />
                    </View>
                  )}
                  <View style={[styles.followButton, { backgroundColor: colors.primary }]}>
                    <Icons.plus size={16} color="white" />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleLike(item.id)}
                >
                  <Icons.heart 
                    size={32} 
                    color={interactionState.interactions[item.id]?.isLiked ? "#EF4444" : "white"}
                    fill={interactionState.interactions[item.id]?.isLiked ? "#EF4444" : "transparent"}
                  />
                  <Text style={styles.actionText}>
                    {formatNumber(item.like_count)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleBookmark(item.id)}
                >
                  <Icons.bookmark 
                    size={32} 
                    color={interactionState.interactions[item.id]?.isBookmarked ? "#4F46E5" : "white"}
                    fill={interactionState.interactions[item.id]?.isBookmarked ? "#4F46E5" : "transparent"}
                  />
                  <Text style={styles.actionText}>
                    {formatNumber(item.bookmark_count || 0)}
                  </Text>
                </TouchableOpacity>

                {currentUserId === item.user_id && (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => openBottomSheet(item)}
                  >
                    <Icons.settings 
                      size={32} 
                      color="white"
                    />
                    <Text style={styles.actionText}>Edit</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => videoState.setIsMuted(!videoState.isMuted)}
                >
                  <Icons.volume2 
                    size={32} 
                    color="white"
                    strokeWidth={1.5}
                    style={videoState.isMuted && styles.mutedIcon}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={adjustedHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={videoState.handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50
        }}
      />

      {/* Bottom Sheet */}
      <Modal
        visible={interactionState.bottomSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => interactionState.setBottomSheetVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => interactionState.setBottomSheetVisible(false)}
        >
          <View 
            style={[
              styles.bottomSheet, 
              { backgroundColor: colors.card }
            ]}
          >
            <View style={styles.bottomSheetHandle} />
            
            <TouchableOpacity 
              style={styles.bottomSheetOption}
              onPress={openEditModal}
            >
              <Icons.edit size={24} color={colors.text} />
              <Text style={[styles.bottomSheetOptionText, { color: colors.text }]}>
                Edit Video Details
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.bottomSheetOption}
              onPress={() => interactionState.setBottomSheetVisible(false)}
            >
              <Icons.share size={24} color={colors.text} />
              <Text style={[styles.bottomSheetOptionText, { color: colors.text }]}>
                Share Video
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.bottomSheetOption, styles.deleteOption]}
              onPress={() => interactionState.setBottomSheetVisible(false)}
            >
              <Icons.trash size={24} color="#EF4444" />
              <Text style={[styles.bottomSheetOptionText, { color: "#EF4444" }]}>
                Delete Video
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={interactionState.editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => interactionState.setEditModalVisible(false)}
      >
        <View style={[styles.editModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.editModalHeader, { backgroundColor: colors.card }]}>
            <TouchableOpacity 
              onPress={() => interactionState.setEditModalVisible(false)}
              style={styles.editModalBackButton}
            >
              <Icons.back size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.editModalTitle, { color: colors.text }]}>
              Edit Video Details
            </Text>
            <View style={styles.editModalPlaceholder} />
          </View>

          <ScrollView style={styles.editModalContent}>
            <View style={styles.editModalForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Title</Text>
                <TextInput
                  style={[
                    styles.formInput, 
                    { 
                      backgroundColor: colors.card,
                      color: colors.text,
                      borderColor: colors.border,
                    }
                  ]}
                  value={interactionState.editVideoData?.title}
                  onChangeText={(text) => interactionState.setEditVideoData(prev => ({ ...prev!, title: text }))}
                  placeholder="Enter video title"
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Description</Text>
                <TextInput
                  style={[
                    styles.formTextarea, 
                    { 
                      backgroundColor: colors.card,
                      color: colors.text,
                      borderColor: colors.border,
                    }
                  ]}
                  value={interactionState.editVideoData?.description}
                  onChangeText={(text) => interactionState.setEditVideoData(prev => ({ ...prev!, description: text }))}
                  placeholder="Enter video description"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Location</Text>
                
                <View style={styles.locationInputContainer}>
                  <TextInput
                    style={[
                      styles.locationInput, 
                      { 
                        backgroundColor: colors.card,
                        color: colors.text,
                        borderColor: colors.border,
                      }
                    ]}
                    value={interactionState.editVideoData?.address}
                    onChangeText={(text) => interactionState.setEditVideoData(prev => ({ ...prev!, address: text }))}
                    placeholder="Enter location address"
                    placeholderTextColor={colors.placeholder}
                  />
                  
                  <View style={styles.locationButtons}>
                    <TouchableOpacity 
                      style={[
                        styles.locationButton, 
                        { backgroundColor: colors.primary }
                      ]}
                      onPress={searchAddress}
                      disabled={interactionState.locationLoading}
                    >
                      {interactionState.locationLoading ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Icons.search size={20} color="white" />
                      )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[
                        styles.locationButton, 
                        { backgroundColor: colors.primary }
                      ]}
                      onPress={getCurrentLocation}
                      disabled={interactionState.locationLoading}
                    >
                      <Icons.navigation size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>

                {interactionState.locationError && (
                  <Text style={styles.locationErrorText}>{interactionState.locationError}</Text>
                )}

                {interactionState.editVideoData?.latitude && interactionState.editVideoData?.longitude && (
                  <View style={[
                    styles.coordinatesContainer, 
                    { 
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    }
                  ]}>
                    <Text style={[styles.coordinatesText, { color: colors.text }]}>
                      Latitude: {interactionState.editVideoData.latitude.toFixed(6)}
                    </Text>
                    <Text style={[styles.coordinatesText, { color: colors.text }]}>
                      Longitude: {interactionState.editVideoData.longitude.toFixed(6)}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: colors.primary },
                  interactionState.saving && { opacity: 0.7 }
                ]}
                onPress={saveVideoChanges}
                disabled={interactionState.saving}
              >
                {interactionState.saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={[styles.editModalFooter, { backgroundColor: colors.card }]}>
            <Button
              title="Cancel"
              onPress={() => interactionState.setEditModalVisible(false)}
              variant="secondary"
            />
            <Button
              title={interactionState.saving ? "Saving..." : "Save Changes"}
              onPress={saveVideoChanges}
              loading={interactionState.saving}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  videoContainer: {
    width: '100%',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  videoInfo: {
    flex: 1,
    justifyContent: 'flex-end',
    marginRight: 16,
  },
  username: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  descriptionContainer: {
    marginBottom: 8,
  },
  description: {
    color: 'white',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  locationIcon: {
    marginRight: 4,
  },
  locationText: {
    color: 'white',
    fontSize: 12,
    flexShrink: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  readMoreButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  readMoreText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  sideActions: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
  },
  profileButton: {
    position: 'relative',
    marginBottom: 8,
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'white',
  },
  profilePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  followButton: {
    position: 'absolute',
    bottom: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'white',
    alignSelf: 'center',
  },
  actionButton: {
    alignItems: 'center',
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  mutedIcon: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  bottomSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  bottomSheetOptionText: {
    fontSize: 16,
    marginLeft: 16,
  },
  deleteOption: {
    borderBottomWidth: 0,
  },
  editModalContainer: {
    flex: 1,
    position: 'relative',
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  editModalBackButton: {
    padding: 8,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  editModalPlaceholder: {
    width: 40,
  },
  editModalContent: {
    flex: 1,
  },
  editModalForm: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  formInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  formTextarea: {
    height: 100,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  locationInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  locationInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  locationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationErrorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 8,
  },
  coordinatesContainer: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  coordinatesText: {
    fontSize: 14,
    marginBottom: 4,
  },
  saveButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  editModalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    gap: 8,
  }
});