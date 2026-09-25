import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({required this.onDone, super.key});
  final VoidCallback onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _page = 0;

  static const _slides = <({String title, String body, IconData icon})>[
    (
      title: 'Your neighbourhood, connected',
      body: 'Discover local shops, food, essentials and services around you.',
      icon: Icons.storefront_rounded,
    ),
    (
      title: 'One simple checkout',
      body: 'Keep your cart, wallet, rewards, addresses and orders together.',
      icon: Icons.shopping_bag_rounded,
    ),
    (
      title: 'Built around you',
      body: 'Get live order updates, loyalty rewards and support when you need it.',
      icon: Icons.favorite_rounded,
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page == _slides.length - 1) {
      widget.onDone();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: widget.onDone,
                child: const Text('Skip'),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (value) => setState(() => _page = value),
                itemBuilder: (context, index) {
                  final slide = _slides[index];
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 150,
                          height: 150,
                          decoration: BoxDecoration(
                            color: AppTokens.mint,
                            borderRadius: BorderRadius.circular(42),
                          ),
                          child: Icon(slide.icon, size: 76, color: AppTokens.green),
                        ),
                        const SizedBox(height: 44),
                        Text(
                          slide.title,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 29, fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          slide.body,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16, height: 1.5, color: AppTokens.muted),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                _slides.length,
                (index) => AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: index == _page ? 24 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: index == _page ? AppTokens.green : AppTokens.line,
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _next,
                  child: Text(_page == _slides.length - 1 ? 'Get started' : 'Continue'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
