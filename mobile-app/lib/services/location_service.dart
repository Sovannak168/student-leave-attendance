import 'dart:async';
import 'dart:ui';
import 'package:flutter/widgets.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_background_service_android/flutter_background_service_android.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';

// Background Isolate Entry Point
@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();

  if (service is AndroidServiceInstance) {
    service.on('setAsForeground').listen((event) {
      service.setAsForegroundService();
    });

    service.on('setAsBackground').listen((event) {
      service.setAsBackgroundService();
    });
  }

  final FlutterSecureStorage storage = const FlutterSecureStorage();
  final token = await storage.read(key: 'token');
  final deviceUuid = await storage.read(key: 'device_uuid');

  // Stop service immediately if user is not authenticated
  if (token == null) {
    service.stopSelf();
    return;
  }

  // Setup Socket.IO connection
  final socketUrl = ApiService.baseUrl.endsWith('/api')
      ? ApiService.baseUrl.substring(0, ApiService.baseUrl.length - 4)
      : ApiService.baseUrl;

  final socket = io.io(socketUrl, io.OptionBuilder()
    .setTransports(['websocket'])
    .setAuth({
      'token': token,
      'deviceUuid': deviceUuid
    })
    .build()
  );

  String geofenceStatus = "ACTIVE";
  Position? currentPosition;
  StreamSubscription<Position>? positionStreamSub;

  socket.onConnect((_) {
    if (kDebugMode) print('[Socket Background] Location socket connected.');
  });

  socket.on('student_geofence_warning', (data) {
    geofenceStatus = "OUT_OF_BOUNDS";
    if (service is AndroidServiceInstance) {
      service.setForegroundNotificationInfo(
        title: "School Security Warning",
        content: "You are currently OUT OF BOUNDS of the school parameter!",
      );
    }
    // Invoke immediate update event to UI
    service.invoke('update', {
      'latitude': currentPosition?.latitude ?? 0.0,
      'longitude': currentPosition?.longitude ?? 0.0,
      'geofenceStatus': geofenceStatus
    });
  });

  socket.onDisconnect((_) {
    if (kDebugMode) print('[Socket Background] Location socket disconnected.');
  });

  // Track location changes
  const locationSettings = LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: 5,
  );

  positionStreamSub = Geolocator.getPositionStream(locationSettings: locationSettings)
      .listen((Position position) {
    currentPosition = position;

    // Reset status to ACTIVE/SAFE on new coordinate, unless geofence status was explicitly flagged as out of bounds by backend warning
    if (geofenceStatus != "OUT_OF_BOUNDS") {
      geofenceStatus = "ACTIVE";
    }

    // Emit coordinates to socket server
    if (socket.connected) {
      socket.emit('location_update', {
        'lat': position.latitude,
        'lng': position.longitude
      });
    }

    // Update Foreground Notification content
    if (service is AndroidServiceInstance) {
      service.setForegroundNotificationInfo(
        title: geofenceStatus == "OUT_OF_BOUNDS"
            ? "School Security Warning"
            : "School Security Tracking",
        content: geofenceStatus == "OUT_OF_BOUNDS"
            ? "You are currently OUT OF BOUNDS!"
            : "Security Tracking is running actively in the background.",
      );
    }

    // Send coordinates to UI
    service.invoke('update', {
      'latitude': position.latitude,
      'longitude': position.longitude,
      'geofenceStatus': geofenceStatus
    });
  });

  // Handle service destruction
  service.on('stopService').listen((event) async {
    await positionStreamSub?.cancel();
    socket.disconnect();
    service.stopSelf();
  });
}

// Background Isolate Entry Point (iOS fallback)
@pragma('vm:entry-point')
bool onIosBackground(ServiceInstance service) {
  WidgetsFlutterBinding.ensureInitialized();
  return true;
}

class LocationService extends ChangeNotifier {
  bool _isTracking = false;
  Position? _currentPosition;
  String _geofenceStatus = "UNKNOWN";

  bool get isTracking => _isTracking;
  Position? get currentPosition => _currentPosition;
  String get geofenceStatus => _geofenceStatus;

  LocationService() {
    _initListener();
    startTracking().catchError((e) {
      if (kDebugMode) print('[LocationService] Auto-start tracking error: $e');
    });
  }

  // Initialize service background listeners for UI updates
  void _initListener() async {
    final service = FlutterBackgroundService();
    _isTracking = await service.isRunning();
    notifyListeners();

    service.on('update').listen((event) {
      if (event != null) {
        _isTracking = true;
        _currentPosition = Position(
          latitude: event['latitude'],
          longitude: event['longitude'],
          timestamp: DateTime.now(),
          accuracy: 0,
          altitude: 0,
          altitudeAccuracy: 0,
          heading: 0,
          headingAccuracy: 0,
          speed: 0,
          speedAccuracy: 0,
        );
        _geofenceStatus = event['geofenceStatus'] ?? 'ACTIVE';
        notifyListeners();
      }
    });

    service.on('stopped').listen((event) {
      _isTracking = false;
      _currentPosition = null;
      _geofenceStatus = "UNKNOWN";
      notifyListeners();
    });
  }

  // Check and request GPS, Notification, and Background Location permissions
  Future<bool> checkPermissions() async {
    // 1. Request notifications permission for Foreground Notification (Android 13+)
    if (await Permission.notification.status.isDenied) {
      await Permission.notification.request();
    }

    // 2. Check if location service is enabled
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    // 3. Request Foreground Location permission
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    // 4. Request strict Background Location Permission (Always Allow)
    if (permission == LocationPermission.whileInUse) {
      final alwaysStatus = await Permission.locationAlways.request();
      if (alwaysStatus != PermissionStatus.granted) {
        if (kDebugMode) print('[Permission] Background Location "Always Allow" was denied.');
      }
    }

    // 5. Bypass Battery Optimization for background consistency
    if (await Permission.ignoreBatteryOptimizations.isDenied) {
      await Permission.ignoreBatteryOptimizations.request();
    }

    return true;
  }

  // Configure and initialize the background service
  static Future<void> initializeBackgroundService() async {
    final service = FlutterBackgroundService();

    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onStart,
        autoStart: false, // Start manually on login
        isForegroundMode: true,
        notificationChannelId: 'my_tracking_channel',
        initialNotificationTitle: 'School Security Tracking',
        initialNotificationContent: 'School Security Tracking is Active',
        foregroundServiceTypes: [AndroidForegroundType.location],
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: onStart,
        onBackground: onIosBackground,
      ),
    );
  }

  // Start Background/Foreground tracking service
  Future<void> startTracking() async {
    final hasPermission = await checkPermissions();
    if (!hasPermission) {
      throw Exception("Location permissions denied.");
    }

    final service = FlutterBackgroundService();
    bool isRunning = await service.isRunning();
    if (!isRunning) {
      await service.startService();
    }
    _isTracking = true;
    notifyListeners();
  }

  // Stop tracking service
  Future<void> stopTracking() async {
    final service = FlutterBackgroundService();
    bool isRunning = await service.isRunning();
    if (isRunning) {
      service.invoke('stopService');
    }
    _isTracking = false;
    _currentPosition = null;
    _geofenceStatus = "UNKNOWN";
    notifyListeners();
  }
}
