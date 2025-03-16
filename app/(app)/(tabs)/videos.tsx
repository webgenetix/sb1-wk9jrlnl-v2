import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { v4 as uuidv4 } from 'uuid';
import 'react-native-get-random-values';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { Ionicons } from '@expo/vector-icons';
import { Icons } from '../../../components/Icons';

interface VideoDetails {
  uri: string;
  duration: number;
  type: string;
  size?: number;
}

interface LocationDetails {
  address: string;
  latitude: number;
  longitude: number;
}

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_DURATION = 60; // 60 seconds

export default function Videos() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoDetails | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [address, setAddress] = useState('');
  const videoRef = useRef(null);

  useEffect(() => {
    if (useCurrentLocation) {
      getCurrentLocation();
    } else {
      setLocationDetails(null);
    }
  }, [useCurrentLocation]);

  async function getCurrentLocation() {
    try {
      setLocationLoading(true);
      setLocationError(null);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission to access location was denied');
        setUseCurrentLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      
      // Get address from coordinates
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const formattedAddress = address ? 
        `${address.street || ''} ${address.name || ''}, ${address.city || ''}, ${address.region || ''} ${address.postalCode || ''}, ${address.country || ''}` 
        : 'Unknown location';
      
      setLocationDetails({
        address: formattedAddress,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      
      setAddress(formattedAddress);
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationError('Failed to get current location');
      setUseCurrentLocation(false);
    } finally {
      setLocationLoading(false);
    }
  }

  async function searchAddress() {
    if (!address.trim()) {
      setLocationError('Please enter an address');
      return;
    }

    try {
      setLocationLoading(true);
      setLocationError(null);

      const geocodeResult = await Location.geocodeAsync(address);
      
      if (geocodeResult.length === 0) {
        setLocationError('Address not found');
        return;
      }

      const { latitude, longitude } = geocodeResult[0];
      
      setLocationDetails({
        address: address,
        latitude,
        longitude,
      });
    } catch (error) {
      console.error('Error geocoding address:', error);
      setLocationError('Failed to find location');
    } finally {
      setLocationLoading(false);
    }
  }

  async function pickVideo() {
    try {
      setError(null);
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        setError('Permission to access media library is required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 1,
        videoMaxDuration: MAX_DURATION,
      });

      if (!result.canceled && result.assets[0]) {
        const video = result.assets[0];
        
        // Check video size
        if (video.fileSize && video.fileSize > MAX_VIDEO_SIZE) {
          setError('Video size must be less than 100MB');
          return;
        }

        setSelectedVideo({
          uri: video.uri,
          duration: video.duration || 0,
          type: video.type || 'video/mp4',
          size: video.fileSize,
        });
      }
    } catch (error) {
      console.error('Error picking video:', error);
      setError('Failed to pick video. Please try again.');
    }
  }

  async function handleUpload() {
    if (!selectedVideo) {
      setError('Please select a video first');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a title for your video');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Generate unique filename
      const ext = selectedVideo.uri.substring(selectedVideo.uri.lastIndexOf('.') + 1);
      const fileName = `${uuidv4()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      let fileData;
      if (Platform.OS === 'web') {
        // For web, fetch the file and create a blob
        const response = await fetch(selectedVideo.uri);
        const blob = await response.blob();
        fileData = blob;
      } else {
        // For native platforms, use the file URI directly
        fileData = {
          uri: selectedVideo.uri,
          type: selectedVideo.type || 'video/mp4',
          name: fileName,
        };
      }

      // Upload video to storage with progress tracking
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, fileData, {
          contentType: selectedVideo.type || 'video/mp4',
          upsert: true,
          onUploadProgress: (progress) => {
            const percentage = (progress.loaded / (progress.total || 1)) * 100;
            setUploadProgress(Math.round(percentage));
          },
        });

      if (uploadError) {
        if (uploadError.message.includes('storage quota')) {
          throw new Error('Storage quota exceeded. Please try a smaller video.');
        }
        throw uploadError;
      }

      // Get video URL
      const { data: { publicUrl: videoUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      // Create video record in database with location data if available
      const videoData = {
        user_id: user.id,
        video_url: videoUrl,
        title: title.trim(),
        description: description.trim(),
        ...(locationDetails && {
          address: locationDetails.address,
          latitude: locationDetails.latitude,
          longitude: locationDetails.longitude,
        }),
      };

      const { error: dbError } = await supabase
        .from('videos')
        .insert(videoData);

      if (dbError) throw dbError;

      // Reset form
      setSelectedVideo(null);
      setTitle('');
      setDescription('');
      setAddress('');
      setLocationDetails(null);
      setUseCurrentLocation(false);
      setError(null);
      setUploadProgress(0);
      
      Alert.alert('Success', 'Video uploaded successfully!');
    } catch (error) {
      console.error('Error uploading video:', error);
      setError(error.message || 'Failed to upload video. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function formatFileSize(bytes?: number) {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Video</Text>
        <Text style={styles.subtitle}>Share your moments with the world</Text>
      </View>

      <View style={styles.content}>
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}

        {!selectedVideo ? (
          <TouchableOpacity 
            style={styles.uploadArea} 
            onPress={pickVideo}
            disabled={uploading}
          >
            <Ionicons name="cloud-upload" size={48} color="#4F46E5" />
            <Text style={styles.uploadText}>Tap to select a video</Text>
            <Text style={styles.uploadSubtext}>
              Maximum size: {formatFileSize(MAX_VIDEO_SIZE)}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.videoPreview}>
            {Platform.OS === 'web' && (
              // @ts-ignore
              <video
                ref={videoRef}
                src={selectedVideo.uri}
                style={styles.videoPlayer}
                controls
              />
            )}
            <View style={styles.videoInfo}>
              <View>
                <Text style={styles.videoInfoText}>
                  Duration: {formatDuration(selectedVideo.duration)}
                </Text>
                <Text style={styles.videoInfoText}>
                  Size: {formatFileSize(selectedVideo.size)}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.changeButton}
                onPress={pickVideo}
                disabled={uploading}
              >
                <Text style={styles.changeButtonText}>Change Video</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.form}>
          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Enter a title for your video"
            error={!title.trim() ? 'Title is required' : undefined}
          />
          
          <View style={styles.descriptionContainer}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description for your video"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.locationSection}>
            <Text style={styles.sectionTitle}>Location</Text>
            
            <TouchableOpacity 
              style={[
                styles.currentLocationButton, 
                useCurrentLocation && styles.currentLocationButtonActive
              ]}
              onPress={() => setUseCurrentLocation(!useCurrentLocation)}
              disabled={locationLoading}
            >
              <Icons.navigation size={20} color={useCurrentLocation ? "white" : "#4F46E5"} />
              <Text style={[
                styles.currentLocationText,
                useCurrentLocation && styles.currentLocationTextActive
              ]}>
                Use current location
              </Text>
              {locationLoading && <ActivityIndicator size="small" color={useCurrentLocation ? "white" : "#4F46E5"} />}
            </TouchableOpacity>

            <View style={styles.addressInputContainer}>
              <TextInput
                style={styles.addressInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter an address"
                disabled={useCurrentLocation || locationLoading}
              />
              <TouchableOpacity 
                style={styles.searchButton}
                onPress={searchAddress}
                disabled={useCurrentLocation || locationLoading || !address.trim()}
              >
                <Icons.search size={20} color="white" />
              </TouchableOpacity>
            </View>

            {locationError && (
              <Text style={styles.locationError}>{locationError}</Text>
            )}

            {locationDetails && (
              <View style={styles.locationDetails}>
                <Text style={styles.locationAddress}>{locationDetails.address}</Text>
                <Text style={styles.locationCoords}>
                  {locationDetails.latitude.toFixed(6)}, {locationDetails.longitude.toFixed(6)}
                </Text>
              </View>
            )}
          </View>

          <Button
            title={uploading ? 'Uploading...' : 'Upload Video'}
            onPress={handleUpload}
            loading={uploading}
          />
        </View>

        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.uploadingText}>
              Uploading video... {uploadProgress}%
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${uploadProgress}%` }
                ]} 
              />
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '95vh',
    width: '100vw',
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  error: {
    color: '#EF4444',
    marginLeft: 8,
    flex: 1,
  },
  uploadArea: {
    backgroundColor: '#EEF2FF',
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  uploadText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4F46E5',
    marginTop: 16,
  },
  uploadSubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  videoPreview: {
    marginBottom: 24,
  },
  videoPlayer: {
    width: '100%',
    height: 240,
    backgroundColor: '#000',
    borderRadius: 12,
  },
  videoInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  videoInfoText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  changeButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeButtonText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '500',
  },
  form: {
    gap: 16,
  },
  descriptionContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 6,
  },
  descriptionInput: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },
  locationSection: {
    marginBottom: 24,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  currentLocationButtonActive: {
    backgroundColor: '#4F46E5',
  },
  currentLocationText: {
    color: '#4F46E5',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  currentLocationTextActive: {
    color: 'white',
  },
  addressInputContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  addressInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    marginRight: 8,
  },
  searchButton: {
    width: 44,
    height: 44,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationError: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 12,
  },
  locationDetails: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  locationAddress: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: '#64748B',
  },
  uploadingContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  uploadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 2,
  },
});