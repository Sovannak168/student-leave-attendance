import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'student_dashboard.dart';
import 'guard_dashboard.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final ApiService _apiService = ApiService();
  final _formKey = GlobalKey<FormState>();

  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _rollNumberController = TextEditingController();
  final TextEditingController _classController = TextEditingController();

  bool _isRegister = false;
  String _selectedRole = 'STUDENT'; // 'STUDENT' or 'GUARD'
  bool _isLoading = false;
  String? _errorMessage;

  void _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    try {
      if (_isRegister) {
        final regRes = await _apiService.register(
          email: email,
          password: password,
          role: _selectedRole,
          rollNumber: _selectedRole == 'STUDENT' ? _rollNumberController.text.trim() : 'N/A',
          className: _selectedRole == 'STUDENT' ? _classController.text.trim() : 'N/A',
        );

        if (regRes['success']) {
          setState(() {
            _isRegister = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Registration successful! Please login.')),
          );
        } else {
          setState(() {
            _errorMessage = regRes['error'];
          });
        }
      } else {
        final loginRes = await _apiService.login(email, password);
        if (loginRes['success']) {
          final user = loginRes['user'];
          final role = user['role'];

          if (role == 'STUDENT') {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => StudentDashboard(studentData: user)),
            );
          } else if (role == 'GUARD') {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => GuardDashboard(guardData: user)),
            );
          } else {
            setState(() {
              _errorMessage = 'Invalid access: Admin role requires Web Admin Panel.';
            });
          }
        } else {
          setState(() {
            _errorMessage = loginRes['error'];
          });
        }
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Connection error. Check backend server connection.';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Premium Dark Theme Palette
    const primaryColor = Color(0xFF6366F1);
    const darkBg = Color(0xFF0D0F12);
    const cardBg = Color(0xFF15181E);
    const borderCol = Color(0xFF232936);

    return Scaffold(
      backgroundColor: darkBg,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Container(
            padding: const EdgeInsets.all(28.0),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(24.0),
              border: Border.all(color: borderCol, width: 1.5),
            ),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.security, color: primaryColor, size: 48),
                  const SizedBox(height: 12),
                  Text(
                    _isRegister ? 'Create Account' : 'Welcome Back',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Student Geofencing & Access Portal',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 24),
                  
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.red.withOpacity(0.3)),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Role selector for Registration
                  if (_isRegister) ...[
                    Row(
                      children: [
                        Expanded(
                          child: ChoiceChip(
                            label: const Text('Student'),
                            selected: _selectedRole == 'STUDENT',
                            selectedColor: primaryColor.withOpacity(0.2),
                            onSelected: (selected) {
                              if (selected) setState(() => _selectedRole = 'STUDENT');
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ChoiceChip(
                            label: const Text('Guard'),
                            selected: _selectedRole == 'GUARD',
                            selectedColor: primaryColor.withOpacity(0.2),
                            onSelected: (selected) {
                              if (selected) setState(() => _selectedRole = 'GUARD');
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],

                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      labelText: 'Email Address',
                      labelStyle: const TextStyle(color: Colors.grey),
                      prefixIcon: const Icon(Icons.email, color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF1B1F28),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                    validator: (v) => v!.isEmpty ? 'Email is required' : null,
                  ),
                  const SizedBox(height: 16),

                  TextFormField(
                    controller: _passwordController,
                    obscureText: true,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      labelStyle: const TextStyle(color: Colors.grey),
                      prefixIcon: const Icon(Icons.lock, color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF1B1F28),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    ),
                    validator: (v) => v!.isEmpty ? 'Password is required' : null,
                  ),
                  const SizedBox(height: 16),

                  // Student fields
                  if (_isRegister && _selectedRole == 'STUDENT') ...[
                    TextFormField(
                      controller: _rollNumberController,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'Roll Number',
                        labelStyle: const TextStyle(color: Colors.grey),
                        prefixIcon: const Icon(Icons.badge, color: Colors.grey),
                        filled: true,
                        fillColor: const Color(0xFF1B1F28),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                      ),
                      validator: (v) => _isRegister && _selectedRole == 'STUDENT' && v!.isEmpty ? 'Roll number required' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _classController,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: InputDecoration(
                        labelText: 'Class / Grade',
                        labelStyle: const TextStyle(color: Colors.grey),
                        prefixIcon: const Icon(Icons.school, color: Colors.grey),
                        filled: true,
                        fillColor: const Color(0xFF1B1F28),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                      ),
                      validator: (v) => _isRegister && _selectedRole == 'STUDENT' && v!.isEmpty ? 'Class required' : null,
                    ),
                    const SizedBox(height: 16),
                  ],

                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _isLoading 
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(_isRegister ? 'Register Account' : 'Sign In', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 16),

                  TextButton(
                    onPressed: () => setState(() => _isRegister = !_isRegister),
                    child: Text(
                      _isRegister ? 'Already have an account? Login' : 'Create new student account',
                      style: const TextStyle(color: primaryColor, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
