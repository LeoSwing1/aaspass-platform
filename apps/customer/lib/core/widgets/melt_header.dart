import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class MeltHeader extends StatefulWidget {
  const MeltHeader({required this.child, super.key});
  final Widget child;
  @override State<MeltHeader> createState() => _MeltHeaderState();
}

class _MeltHeaderState extends State<MeltHeader> with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat(reverse: true);
  @override void dispose() { controller.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (_, _) {
        final melt = 0.30 + controller.value * 0.18;
        return Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: const [AppTokens.limeHeader, Color(0xFFEFF8C9), Color(0xFFF7FAF3), Colors.white],
              stops: [0, .52, .78 + melt * .15, 1],
            ),
          ),
          child: widget.child,
        );
      },
    );
  }
}

class AasPassLoading extends StatefulWidget {
  const AasPassLoading({this.label = 'Getting your AasPass basket ready', super.key});
  final String label;
  @override State<AasPassLoading> createState() => _AasPassLoadingState();
}
class _AasPassLoadingState extends State<AasPassLoading> with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat(reverse: true);
  @override void dispose() { controller.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.white,
    body: Center(child: AnimatedBuilder(animation: controller, builder: (_, _) {
      final dy = -8 * controller.value;
      return Column(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(height: 104, child: Stack(alignment: Alignment.center, children: [
          Transform.translate(offset: Offset(-30, dy), child: Image.asset('assets/products/banana.png', width: 54, height: 54)),
          Transform.translate(offset: Offset(28, -dy), child: Image.asset('assets/products/soap.png', width: 54, height: 54)),
          Positioned(bottom: 2, child: Container(width: 100, height: 7, decoration: BoxDecoration(color: Colors.black.withValues(alpha: .08), borderRadius: BorderRadius.circular(99)))),
        ])),
        const SizedBox(height: 26),
        Text(widget.label, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppTokens.ink)),
        const SizedBox(height: 7),
        const Text('Nearby stores • fresh local picks • secure checkout', style: TextStyle(fontSize: 10.5, color: AppTokens.muted)),
        const SizedBox(height: 18),
        SizedBox(width: 130, child: ClipRRect(borderRadius: BorderRadius.circular(99), child: const LinearProgressIndicator(minHeight: 3, color: AppTokens.green, backgroundColor: AppTokens.mint))),
      ]);
    })),
  );
}
