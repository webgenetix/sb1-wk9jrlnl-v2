import { useEffect } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View, Text, TouchableOpacity, Platform, SafeAreaView } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Icons } from '../../components/Icons';
import { useTheme } from '../../lib/ThemeContext';

// Sample video sources
const videoSources = [
  {
    id: '1',
    title: 'Big Buck Bunny',
    description: 'A short animated film featuring a giant rabbit and three rodent bullies',
    source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1578326457399-3b34dbbf23b8?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: '2',
    title: 'Elephants Dream',
    description: 'The first Blender Open Movie from 2006',
    source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: '3',
    title: 'Sintel',
    description: 'Third Open Movie by Blender Foundation',
    source: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1560759226-14da22a643ef?w=800&auto=format&fit=crop&q=80'
  }
];

export default function VideoPlayer() {
  const { colors, isDark } = useTheme();
  const currentVideo = videoSources[0]; // Default to first video

  const player = useVideoPlayer(currentVideo.source, player => {
    player.loop = true;
    player.volume = 0.75;
    
    // Auto-play only on native platforms or if allowed by browser
    if (Platform.OS !== 'web') {
      player.play();
    }
  });

  // Handle player events
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { position } = useEvent(player, 'positionChange', { position: 0 });
  const { duration } = useEvent(player, 'durationChange', { duration: 0 });
  const { buffered } = useEvent(player, 'bufferedChange', { buffered: [] });
  const { volume } = useEvent(player, 'volumeChange', { volume: player.volume });

  useEffect(() => {
    // Clean up player when component unmounts
    return () => {
      player.pause();
    };
  }, [player]);

  // Format time (seconds) to MM:SS
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds === 0) return '00:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate buffered percentage
  const getBufferedPercentage = () => {
    if (!buffered || buffered.length === 0 || duration === 0) return 0;
    return (buffered[0].end / duration) * 100;
  };

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (duration === 0) return 0;
    return (position / duration) * 100;
  };

  // Handle seeking
  const seek = (percentage: number) => {
    if (duration > 0) {
      const newPosition = (percentage / 100) * duration;
      player.seek(newPosition);
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (Platform.OS !== 'web') {
      player.presentFullscreen();
    } else {
      // For web, use browser fullscreen API
      const videoElement = document.querySelector('video');
      if (videoElement) {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          videoElement.requestFullscreen();
        }
      }
    }
  };

  // Toggle playback
  const togglePlayback = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  // Toggle mute
  const toggleMute = () => {
    player.volume = volume > 0 ? 0 : 0.75;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Icons.back size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Video Player</Text>
        <View style={styles.placeholderButton} />
      </View>

      <View style={styles.videoContainer}>
        <VideoView 
          style={styles.video} 
          player={player}
          allowsFullscreen
          allowsPictureInPicture
        />
        
        <View style={styles.overlayControls}>
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.bufferedBar, { width: `${getBufferedPercentage()}%` }]} />
            <View style={[styles.progressBar, { width: `${getProgressPercentage()}%` }]} />
            
            {/* Seek thumb - simplified version without actual dragging logic */}
            <View 
              style={[
                styles.seekThumb, 
                { left: `${getProgressPercentage()}%` }
              ]} 
            />
          </View>
          
          {/* Time indicators */}
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
          
          {/* Playback controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity onPress={toggleMute} style={styles.controlButton}>
              <Icons.volume2 size={24} color="white" style={volume === 0 ? styles.mutedIcon : undefined} />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
              {isPlaying ? (
                <Icons.pause size={28} color="white" />
              ) : (
                <Icons.play size={28} color="white" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={toggleFullscreen} style={styles.controlButton}>
              <Icons.maximize size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.infoContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.videoTitle, { color: colors.text }]}>{currentVideo.title}</Text>
        <Text style={[styles.videoDescription, { color: colors.subtext }]}>
          {currentVideo.description}
        </Text>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Icons.eye size={16} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.subtext }]}>15.2K views</Text>
          </View>
          <View style={styles.statItem}>
            <Icons.heart size={16} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.subtext }]}>1.8K likes</Text>
          </View>
          <View style={styles.statItem}>
            <Icons.share size={16} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.subtext }]}>Share</Text>
          </View>
        </View>
      </View>

      <View style={styles.suggestedVideosContainer}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>More Videos</Text>
        
        <View style={styles.videoList}>
          {videoSources.slice(1).map((video) => (
            <TouchableOpacity 
              key={video.id}
              style={[styles.videoItem, { backgroundColor: colors.card }]}
              onPress={() => {
                // In a real app, this would switch the current video
                // For this demo, we just show an alert
                alert(`Switching to: ${video.title}`);
              }}
            >
              <View style={styles.thumbnailContainer}>
                <View style={styles.thumbnail}>
                  {/* Using placeholder image */}
                  {Platform.OS === 'web' ? (
                    <img 
                      src={video.thumbnail} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.primaryLight }]}>
                      <Icons.video size={24} color={colors.primary} />
                    </View>
                  )}
                </View>
                <View style={styles.duration}>
                  <Text style={styles.durationText}>10:30</Text>
                </View>
              </View>
              
              <View style={styles.videoItemInfo}>
                <Text 
                  style={[styles.videoItemTitle, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {video.title}
                </Text>
                <Text 
                  style={[styles.videoItemMeta, { color: colors.subtext }]}
                  numberOfLines={1}
                >
                  8.5K views • 2 days ago
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 48,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholderButton: {
    width: 40,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  overlayControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  progressContainer: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  bufferedBar: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  progressBar: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#4F46E5',
  },
  seekThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4F46E5',
    top: -4,
    marginLeft: -6,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  timeText: {
    color: 'white',
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlButton: {
    padding: 8,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mutedIcon: {
    opacity: 0.5,
  },
  infoContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  videoDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
  },
  suggestedVideosContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  videoList: {
    gap: 16,
  },
  videoItem: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: 120,
    height: 80,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E2E8F0',
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  duration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: 'white',
    fontSize: 12,
  },
  videoItemInfo: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  videoItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  videoItemMeta: {
    fontSize: 12,
  },
});