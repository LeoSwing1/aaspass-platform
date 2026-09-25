import 'package:flutter/material.dart';

abstract final class AppTokens {
  static const green = Color(0xFF0B7A53);
  static const greenDark = Color(0xFF075C3E);
  static const mint = Color(0xFFEAF7F1);
  static const limeHeader = Color(0xFFE9F7B9);
  static const limeLine = Color(0xFFD8E8A0);
  static const limeStrong = Color(0xFFB8D77A);
  static const surface = Color(0xFFFFFFFF);
  static const bg = Color(0xFFF6F8F6);
  static const ink = Color(0xFF17221C);
  static const muted = Color(0xFF6D776F);
  static const border = Color(0xFFE1E9E4);
  static const line = Color(0xFFE3E3E3);
  static const offer = Color(0xFFE36A2D);
  static const gold = Color(0xFFF2B84B);
  static const error = Color(0xFFB3261E);
  static const radiusSm = 10.0;
  static const radiusMd = 14.0;
  static const radiusLg = 18.0;
  static const radiusXl = 24.0;
}

class AppTheme {
  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(seedColor: AppTokens.green, brightness: Brightness.light).copyWith(primary: AppTokens.green, secondary: AppTokens.offer, surface: AppTokens.surface);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppTokens.bg,
      appBarTheme: const AppBarTheme(elevation: 0, backgroundColor: Colors.transparent, surfaceTintColor: Colors.transparent, foregroundColor: AppTokens.ink),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: AppTokens.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppTokens.radiusMd), borderSide: const BorderSide(color: AppTokens.border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(AppTokens.radiusMd), borderSide: const BorderSide(color: AppTokens.border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(AppTokens.radiusMd), borderSide: const BorderSide(color: AppTokens.green, width: 1.3)),
      ),
      cardTheme: CardThemeData(color: AppTokens.surface, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusLg))),
      navigationBarTheme: NavigationBarThemeData(backgroundColor: Colors.white, indicatorColor: AppTokens.mint, height: 76, labelBehavior: NavigationDestinationLabelBehavior.alwaysShow, labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 11, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600, color: s.contains(WidgetState.selected) ? AppTokens.greenDark : AppTokens.muted))),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(48, 48), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTokens.radiusMd)), textStyle: const TextStyle(fontWeight: FontWeight.w800))),
      chipTheme: ChipThemeData(backgroundColor: Colors.white, side: const BorderSide(color: AppTokens.border), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)), labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTokens.ink)),
    );
  }
}
