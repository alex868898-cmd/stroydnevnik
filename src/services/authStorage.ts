import AsyncStorage from '@react-native-async-storage/async-storage';

// Native builds use the device-backed React Native storage implementation.
export const authStorage = AsyncStorage;
