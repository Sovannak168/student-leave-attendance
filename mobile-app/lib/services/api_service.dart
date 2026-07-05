import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class ApiService {
  // FOR PRODUCTION: Change this to your deployed Render service URL (e.g. 'https://your-service.onrender.com/api')
  static const String baseUrl = 'https://student-geofence-backend.onrender.com/api'; // Live Render backend url
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  // Retrieve or generate persistent unique device UUID
  Future<String> getDeviceUuid() async {
    String? deviceUuid = await _storage.read(key: 'device_uuid');
    if (deviceUuid == null) {
      deviceUuid = const Uuid().v4();
      await _storage.write(key: 'device_uuid', value: deviceUuid);
    }
    return deviceUuid;
  }

  // Get active session token
  Future<String?> getToken() async {
    return await _storage.read(key: 'token');
  }

  // Securely cache token
  Future<void> saveToken(String token) async {
    await _storage.write(key: 'token', value: token);
  }

  // Clear cached tokens
  Future<void> logout() async {
    await _storage.delete(key: 'token');
  }

  // LOGIN
  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final deviceUuid = await getDeviceUuid();

      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email,
          'password': password,
          'deviceUuid': deviceUuid,
        }),
      ).timeout(const Duration(seconds: 7));

      final responseData = jsonDecode(response.body);
      if (response.statusCode == 200) {
        await saveToken(responseData['token']);
        return {'success': true, 'user': responseData['user']};
      } else {
        return {'success': false, 'error': responseData['error'] ?? 'Login failed'};
      }
    } on TimeoutException catch (_) {
      return {
        'success': false,
        'error': 'Connection timed out. Make sure your mobile is on the same Wi-Fi network and the firewall allows port 5000.'
      };
    } catch (e) {
      return {
        'success': false,
        'error': 'Network error: Please verify the server is running and reachable.'
      };
    }
  }

  // REGISTER
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String role,
    required String rollNumber,
    required String className,
    String? phone,
    String? parentPhone,
  }) async {
    try {
      final deviceUuid = await getDeviceUuid();

      final response = await http.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email,
          'password': password,
          'role': role,
          'rollNumber': rollNumber,
          'className': className,
          'phone': phone,
          'parentPhone': parentPhone,
          'deviceUuid': deviceUuid,
        }),
      ).timeout(const Duration(seconds: 7));

      final responseData = jsonDecode(response.body);
      if (response.statusCode == 201) {
        return {'success': true, 'message': responseData['message']};
      } else {
        return {'success': false, 'error': responseData['error'] ?? 'Registration failed'};
      }
    } on TimeoutException catch (_) {
      return {
        'success': false,
        'error': 'Connection timed out. Make sure your mobile is on the same Wi-Fi network.'
      };
    } catch (e) {
      return {
        'success': false,
        'error': 'Network error: Please verify the server is running and reachable.'
      };
    }
  }

  // SUBMIT LEAVE REQUEST
  Future<Map<String, dynamic>> requestLeave(String reason, DateTime exitTime, DateTime returnTime) async {
    try {
      final token = await getToken();
      if (token == null) return {'success': false, 'error': 'Not authenticated'};

      final response = await http.post(
        Uri.parse('$baseUrl/permissions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'reason': reason,
          'exitTime': exitTime.toIso8601String(),
          'returnTime': returnTime.toIso8601String(),
        }),
      ).timeout(const Duration(seconds: 7));

      final responseData = jsonDecode(response.body);
      if (response.statusCode == 201) {
        return {'success': true, 'permission': responseData['permission']};
      } else {
        return {'success': false, 'error': responseData['error'] ?? 'Failed to submit leave request'};
      }
    } on TimeoutException catch (_) {
      return {'success': false, 'error': 'Request timed out. Please check network connectivity.'};
    } catch (e) {
      return {'success': false, 'error': 'Network connection error.'};
    }
  }

  // FETCH ACTIVE QR CODE DETAILS
  Future<Map<String, dynamic>> fetchActiveQrCode() async {
    try {
      final token = await getToken();
      if (token == null) return {'success': false, 'error': 'Not authenticated'};

      final response = await http.get(
        Uri.parse('$baseUrl/permissions/active/qr'),
        headers: {
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 7));

      final responseData = jsonDecode(response.body);
      if (response.statusCode == 200) {
        return {'success': true, 'qrToken': responseData['qrToken'], 'type': responseData['type']};
      } else {
        return {'success': false, 'error': responseData['error'] ?? 'No active geofence permission'};
      }
    } on TimeoutException catch (_) {
      return {'success': false, 'error': 'Request timed out. Please check network connectivity.'};
    } catch (e) {
      return {'success': false, 'error': 'Network connection error.'};
    }
  }

  // GUARD SCAN QR CODE
  Future<Map<String, dynamic>> scanQrCode(String qrToken) async {
    try {
      final token = await getToken();
      final deviceUuid = await getDeviceUuid();
      if (token == null) return {'success': false, 'error': 'Not authenticated'};

      final response = await http.post(
        Uri.parse('$baseUrl/exit-logs/scan'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
          'x-device-uuid': deviceUuid,
        },
        body: jsonEncode({
          'qrToken': qrToken,
        }),
      ).timeout(const Duration(seconds: 7));

      final responseData = jsonDecode(response.body);
      if (response.statusCode == 200 && responseData['accessGranted'] == true) {
        return {'success': true, 'message': responseData['message'], 'details': responseData['logDetails']};
      } else {
        return {'success': false, 'error': responseData['error'] ?? 'Validation failed'};
      }
    } on TimeoutException catch (_) {
      return {'success': false, 'error': 'Request timed out. Please check network connectivity.'};
    } catch (e) {
      return {'success': false, 'error': 'Network connection error.'};
    }
  }
}
