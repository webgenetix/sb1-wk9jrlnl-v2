import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Icons } from '../../../components/Icons';
import { useTheme } from '../../../lib/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { router } from 'expo-router';

// Conditionally import MapView to avoid errors on web
// Web fallback component instead of conditional imports
const MapFallback = () => (
  <View style={styles.webFallback}>
    <Text>Maps are not supported on web</Text>
  </View>
);

interface VideoLocation {
  id: string;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  user_id: string;
  username: string;
  avatar_url: string;
}

export default function MapScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState('standard');
  const [videoLocations, setVideoLocations] = useState<VideoLocation[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        setLocation(location);
      } catch (error) {
        setErrorMsg('Could not fetch location');
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();

    loadVideoLocations();
  }, []);

  async function loadVideoLocations() {
    try {
      setLoadingVideos(true);
      
      // Fetch videos with location data
      const { data: videos, error } = await supabase
        .from('videos')
        .select('id, title, description, address, latitude, longitude, user_id')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      
      if (error) throw error;

      // Get user profiles for each video
      const videosWithProfiles = await Promise.all(
        videos.map(async (video) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', video.user_id)
            .single();
          
          return {
            ...video,
            username: profile?.username || 'Unknown user',
            avatar_url: profile?.avatar_url || null,
          };
        })
      );

      setVideoLocations(videosWithProfiles);
    } catch (error) {
      console.error('Error loading video locations:', error);
    } finally {
      setLoadingVideos(false);
    }
  }

  const toggleMapType = () => {
    setMapType(prev => prev === 'standard' ? 'satellite' : 'standard');
  };

  function navigateToVideo(videoId: string) {
    router.push('/videoscroll');
  }

  const initialRegion = location ? {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  } : {
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  // Web fallback component
  const WebMapFallback = () => (
    <View style={[styles.webFallback, { backgroundColor: colors.background }]}>
      <Icons.mapPin size={48} color={colors.primary} />
      <Text style={[styles.webFallbackTitle, { color: colors.text }]}>
        Map View
      </Text>
      <Text style={[styles.webFallbackText, { color: colors.subtext }]}>
        Maps are currently only available on mobile devices.
      </Text>
      {location && (
        <View style={[styles.locationInfo, { backgroundColor: colors.card }]}>
          <Text style={[styles.locationTitle, { color: colors.text }]}>Your Location</Text>
          <Text style={[styles.locationText, { color: colors.subtext }]}>
            Latitude: {location.coords.latitude.toFixed(6)}
          </Text>
          <Text style={[styles.locationText, { color: colors.subtext }]}>
            Longitude: {location.coords.longitude.toFixed(6)}
          </Text>
          <TouchableOpacity 
            style={[styles.openMapsButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              const url = `https://www.google.com/maps/search/?api=1&query=${location.coords.latitude},${location.coords.longitude}`;
              window.open(url, '_blank');
            }}
          >
            <Text style={styles.openMapsButtonText}>Open in Google Maps</Text>
          </TouchableOpacity>
        </View>
      )}

      {videoLocations.length > 0 && (
        <View style={[styles.videoLocationsContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.locationTitle, { color: colors.text }]}>Videos Near You</Text>
          {videoLocations.map(video => (
            <TouchableOpacity 
              key={video.id}
              style={styles.videoLocationItem}
              onPress={() => navigateToVideo(video.id)}
            >
              <View style={styles.videoLocationContent}>
                <Text style={[styles.videoLocationTitle, { color: colors.text }]}>
                  {video.title}
                </Text>
                <Text style={[styles.videoLocationAddress, { color: colors.subtext }]}>
                  {video.address}
                </Text>
                <Text style={[styles.videoLocationUser, { color: colors.primary }]}>
                  @{video.username}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>
          Getting your location...
        </Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Icons.mapPin size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>{errorMsg}</Text>
        <TouchableOpacity 
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            setLoading(true);
            setErrorMsg(null);
            Location.getCurrentPositionAsync({})
              .then(location => {
                setLocation(location);
                setLoading(false);
              })
              .catch(error => {
                setErrorMsg('Could not fetch location');
                setLoading(false);
              });
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Web fallback
  if (Platform.OS === 'web') {
    return <WebMapFallback />;
  }

  // Only render the map on native platforms
  return (
    <View style={styles.container}>
      {MapView && (
        <MapView 
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton
          showsCompass
          showsScale
          mapType={mapType}
        >
          {location && Marker && (
            <Marker
              coordinate={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              }}
              title="You are here"
              description="Your current location"
              pinColor="#4F46E5"
            />
          )}

          {videoLocations.map(video => (
            Marker && Callout && (
              <Marker
                key={video.id}
                coordinate={{
                  latitude: video.latitude,
                  longitude: video.longitude,
                }}
                title={video.title}
                description={video.address}
                pinColor="#EF4444"
              >
                <Callout onPress={() => navigateToVideo(video.id)}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>{video.title}</Text>
                    <Text style={styles.calloutAddress}>{video.address}</Text>
                    <View style={styles.calloutUser}>
                      {video.avatar_url ? (
                        <Image 
                          source={{ uri: video.avatar_url }} 
                          style={styles.calloutAvatar} 
                        />
                      ) : (
                        <View style={styles.calloutAvatarPlaceholder}>
                          <Icons.user size={12} color="#64748B" />
                        </View>
                      )}
                      <Text style={styles.calloutUsername}>@{video.username}</Text>
                    </View>
                    <Text style={styles.calloutAction}>Tap to watch video</Text>
                  </View>
                </Callout>
              </Marker>
            )
          ))}
        </MapView>
      )}
      
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Explore Videos</Text>
        {loadingVideos && (
          <ActivityIndicator size="small" color="white" style={styles.headerLoader} />
        )}
      </View>
      
      <View style={[styles.controls, { bottom: insets.bottom + 16 }]}>
        <TouchableOpacity 
          style={styles.mapTypeButton}
          onPress={toggleMapType}
        >
          <Icons.layers size={24} color="white" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.currentLocationButton}
          onPress={() => {
            if (location) {
              // Re-center map to current location
              // Note: This would need a ref to the MapView to implement fully
            }
          }}
        >
          <Icons.navigation size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={loadVideoLocations}
        >
          <Icons.refresh size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={[styles.videoCounter, { bottom: insets.bottom + 80 }]}>
        <Text style={styles.videoCounterText}>
          {videoLocations.length} {videoLocations.length === 1 ? 'video' : 'videos'} on map
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  headerLoader: {
    marginLeft: 8,
  },
  controls: {
    position: 'absolute',
    right: 16,
    flexDirection: 'column',
    gap: 12,
  },
  mapTypeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentLocationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoCounter: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  videoCounterText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    marginBottom: 24,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  webFallbackTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  webFallbackText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 400,
  },
  locationInfo: {
    width: '100%',
    maxWidth: 400,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  locationText: {
    fontSize: 16,
    marginBottom: 8,
  },
  openMapsButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  openMapsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  videoLocationsContainer: {
    width: '100%',
    maxWidth: 400,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  videoLocationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  videoLocationContent: {
    flex: 1,
  },
  videoLocationTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoLocationAddress: {
    fontSize: 14,
    marginBottom: 4,
  },
  videoLocationUser: {
    fontSize: 14,
    fontWeight: '500',
  },
  callout: {
    width: 200,
    padding: 12,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  calloutAddress: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
  },
  calloutUser: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  calloutAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  calloutAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  calloutUsername: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
  },
  calloutAction: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
});