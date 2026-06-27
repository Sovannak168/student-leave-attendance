import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_service.dart';
import 'login_screen.dart';

class GuardDashboard extends StatefulWidget {
  final Map<String, dynamic> guardData;
  const GuardDashboard({super.key, required this.guardData});

  @override
  State<GuardDashboard> createState() => _GuardDashboardState();
}

class _GuardDashboardState extends State<GuardDashboard> {
  final ApiService _apiService = ApiService();
  final MobileScannerController _scannerController = MobileScannerController();
  
  bool _isProcessing = false;

  void _onDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;
    
    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final String? qrToken = barcodes.first.rawValue;
    if (qrToken == null) return;

    setState(() {
      _isProcessing = true;
    });
    
    // Pause scanning
    _scannerController.stop();

    // Call validation API
    final res = await _apiService.scanQrCode(qrToken);

    if (mounted) {
      _showScanResultDialog(res);
    }
  }

  void _showScanResultDialog(Map<String, dynamic> result) {
    final success = result['success'] == true;
    final title = success ? 'Access Granted' : 'Access Denied';
    final color = success ? Colors.green : Colors.red;
    final icon = success ? Icons.check_circle : Icons.cancel;
    
    String message = '';
    if (success) {
      final details = result['details'];
      message = 'Student: ${details['name']}\nRoll: ${details['rollNumber']}\nAction: ${details['logType']}';
    } else {
      message = result['error'] ?? 'Invalid pass verification details.';
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF15181E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: color.withOpacity(0.4))),
        title: Row(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(width: 8),
            Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Text(
          message,
          style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.5),
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              setState(() {
                _isProcessing = false;
              });
              // Resume scanning
              _scannerController.start();
            },
            style: ElevatedButton.styleFrom(backgroundColor: color),
            child: const Text('Scan Next', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
          )
        ],
      ),
    );
  }

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const darkBg = Color(0xFF0D0F12);
    const cardBg = Color(0xFF15181E);
    const primaryColor = Color(0xFF6366F1);

    return Scaffold(
      backgroundColor: darkBg,
      appBar: AppBar(
        backgroundColor: cardBg,
        title: const Text('Guard Scanner Portal', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            onPressed: () async {
              await _apiService.logout();
              Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const LoginScreen()));
            },
          )
        ],
      ),
      body: Stack(
        children: [
          // 1. CAMERA STREAM
          MobileScanner(
            controller: _scannerController,
            onDetect: _onDetect,
          ),

          // 2. SCANNING RETICLE OVERLAY
          Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(color: _isProcessing ? Colors.orange : primaryColor, width: 3),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Align(
                alignment: Alignment.topCenter,
                child: Padding(
                  padding: EdgeInsets.only(top: 8.0),
                  child: Text(
                    'ALIGN QR PASS HERE',
                    style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.5),
                  ),
                ),
              ),
            ),
          ),

          // 3. MANUAL INSTRUCTIONS
          Positioned(
            bottom: 40,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardBg.withOpacity(0.95),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF232936)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.camera_alt, color: primaryColor),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Point Camera at Pass', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                        SizedBox(height: 2),
                        Text('Verification and gate log registry is fully automated.', style: TextStyle(color: Colors.grey, fontSize: 11)),
                      ],
                    ),
                  )
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
