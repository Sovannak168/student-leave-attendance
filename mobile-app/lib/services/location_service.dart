import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api_service.dart';

class LocationService extends ChangeNotifier {
  final ApiService _apiService = ApiService();
  io.Socket? _socket;
  StreamSubscription<Position>? _positionStreamSub;
  
  bool _isTracking = false;
  Position? _currentPosition;
  String _geofenceStatus = "UNKNOWN";

  bool get isTracking => _isTracking;
  Position? get currentPosition => _currentPosition;
  String get geofenceStatus => _geofenceStatus;

  // Initialize Socket.IO connection for location streaming
  Future<void> initSocket() async {
    final token = await _apiService.getToken();
    final deviceUuid = await _apiService.getDeviceUuid();

    if (token == null) return;

    // Disconnect old socket if any
    _socket?.disconnect();

    // Setup socket configuration targeting server
    // Note: Use computer's local IP for real device connectivity
    _socket = io.io('http://172.168.25.92:5000', io.OptionBuilder()
      .setTransports(['websocket'])
      .setAuth({
        'token': token,
        'deviceUuid': deviceUuid
      })
      .build()
    );

    _socket!.onConnect((_) {
      if (kDebugMode) print('[Socket] Location socket connected.');
    });

    _socket!.on('student_geofence_warning', (data) {
      _geofenceStatus = "OUT_OF_BOUNDS";
      notifyListeners();
    });

    _socket!.onDisconnect((_) {
      if (kDebugMode) print('[Socket] Location socket disconnected.');
    });
  }

  // Check and request GPS permissions
  Future<bool> checkPermissions() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }
    
    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  // Start background/foreground tracking
  Future<void> startTracking() async {
    if (_isTracking) return;

    final hasPermission = await checkPermissions();
    if (!hasPermission) {
      throw Exception("Location permissions denied.");
    }

    await initSocket();
    _isTracking = true;
    notifyListeners();

    // Configure tracking settings (accurate within 5 meters, updates every 10 seconds or 5 meters distance)
    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 5,
    );

    _positionStreamSub = Geolocator.getPositionStream(locationSettings: locationSettings)
        .listen((Position position) {
      _currentPosition = position;
      
      // If we are inside/outside, default resets status on update unless backend warns us
      _geofenceStatus = "ACTIVE"; 
      notifyListeners();

      // Emit coordinates to socket server
      if (_socket != null && _socket!.connected) {
        _socket!.emit('location_update', {
          'lat': position.latitude,
          'lng': position.longitude
        });
      }
    });
  }

  // Stop tracking
  Future<void> stopTracking() async {
    if (!_isTracking) return;

    await _positionStreamSub?.cancel();
    _positionStreamSub = null;
    
    _socket?.disconnect();
    _socket = null;

    _isTracking = false;
    _currentPosition = null;
    _geofenceStatus = "UNKNOWN";
    notifyListeners();
  }

  @override
  void dispose() {
    stopTracking();
    super.dispose();
  }
}
