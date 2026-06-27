import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

class ApiService {
  // FOR PRODUCTION: Change this to your deployed Render service URL (e.g. 'https://your-service.onrender.com/api')
  static const String baseUrl = 'http://172.168.25.92:5000/api'; // Computer's local IP address for real device connectivity
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
    final deviceUuid = await getDeviceUuid();

    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'deviceUuid': deviceUuid,
      }),
    );

    final responseData = jsonDecode(response.body);
    if (response.statusCode == 200) {
      await saveToken(responseData['token']);
      return {'success': true, 'user': responseData['user']};
    } else {
      return {'success': false, 'error': responseData['error'] ?? 'Login failed'};
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
    );

    final responseData = jsonDecode(response.body);
    if (response.statusCode == 201) {
      return {'success': true, 'message': responseData['message']};
    } else {
      return {'success': false, 'error': responseData['error'] ?? 'Registration failed'};
    }
  }

  // SUBMIT LEAVE REQUEST
  Future<Map<String, dynamic>> requestLeave(String reason, DateTime exitTime, DateTime returnTime) async {
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
    );

    final responseData = jsonDecode(response.body);
    if (response.statusCode == 201) {
      return {'success': true, 'permission': responseData['permission']};
    } else {
      return {'success': false, 'error': responseData['error'] ?? 'Failed to submit leave request'};
    }
  }

  // FETCH ACTIVE QR CODE DETAILS
  Future<Map<String, dynamic>> fetchActiveQrCode() async {
    final token = await getToken();
    if (token == null) return {'success': false, 'error': 'Not authenticated'};

    final response = await http.get(
      Uri.parse('$baseUrl/permissions/active/qr'),
      headers: {
        'Authorization': 'Bearer $token',
      },
    );

    final responseData = jsonDecode(response.body);
    if (response.statusCode == 200) {
      return {'success': true, 'qrToken': responseData['qrToken'], 'type': responseData['type']};
    } else {
      return {'success': false, 'error': responseData['error'] ?? 'No active geofence permission'};
    }
  }

  // GUARD SCAN QR CODE
  Future<Map<String, dynamic>> scanQrCode(String qrToken) async {
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
    );

    final responseData = jsonDecode(response.body);
    if (response.statusCode == 200 && responseData['accessGranted'] == true) {
      return {'success': true, 'message': responseData['message'], 'details': responseData['logDetails']};
    } else {
      return {'success': false, 'error': responseData['error'] ?? 'Validation failed'};
    }
  }
}
