import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/student_dashboard.dart';
import 'screens/guard_dashboard.dart';
import 'services/api_service.dart';
import 'services/location_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LocationService.initializeBackgroundService();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Premium Design Dark Theme matching Web Dashboard aesthetics
    final darkTheme = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: const Color(0xFF6366F1),
      scaffoldBackgroundColor: const Color(0xFF0D0F12),
      cardColor: const Color(0xFF15181E),
      dividerColor: const Color(0xFF232936),
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFF6366F1),
        secondary: Color(0xFF4F46E5),
        surface: Color(0xFF15181E),
        error: Color(0xFFEF4444),
      ),
      textTheme: const TextTheme(
        bodyLarge: TextStyle(fontFamily: 'Roboto', color: Colors.white),
        bodyMedium: TextStyle(fontFamily: 'Roboto', color: Color(0xFFF3F4F6)),
      ),
    );

    return MaterialApp(
      title: 'Student Geofence System',
      theme: darkTheme,
      debugShowCheckedModeBanner: false,
      home: const AuthSessionChecker(),
    );
  }
}

class AuthSessionChecker extends StatefulWidget {
  const AuthSessionChecker({super.key});

  @override
  State<AuthSessionChecker> createState() => _AuthSessionCheckerState();
}

class _AuthSessionCheckerState extends State<AuthSessionChecker> {
  final ApiService _apiService = ApiService();
  bool _checking = true;
  Widget _targetScreen = const LoginScreen();

  @override
  void initState() {
    super.initState();
    _checkActiveSession();
  }

  void _checkActiveSession() async {
    final token = await _apiService.getToken();
    if (token == null) {
      if (mounted) {
        setState(() {
          _checking = false;
        });
      }
      return;
    }

    try {
      final response = await http_get_me(token);
      if (response != null && response['success'] == true) {
        final user = response['user'];
        final role = user['role'];

        if (role == 'STUDENT') {
          _targetScreen = StudentDashboard(studentData: user);
        } else if (role == 'GUARD') {
          _targetScreen = GuardDashboard(guardData: user);
        }
      } else {
        // Token is invalid/expired
        await _apiService.logout();
      }
    } catch (e) {
      // Offline/connection issues: fallback to login screen
    } finally {
      if (mounted) {
        setState(() {
          _checking = false;
        });
      }
    }
  }

  // Quick direct inline HTTP call to verify token and get details
  Future<Map<String, dynamic>?> http_get_me(String token) async {
    try {
      final response = await http.get(
        Uri.parse('${ApiService.baseUrl}/auth/me'),
        headers: {
          'Authorization': 'Bearer $token',
        },
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return {'success': true, 'user': data['user']};
      }
      return {'success': false};
    } catch (e) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF6366F1)),
        ),
      );
    }
    return _targetScreen;
  }
}
