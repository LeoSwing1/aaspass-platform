import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class AasPassSplashOverlay extends StatefulWidget {
  const AasPassSplashOverlay({super.key});
  @override State<AasPassSplashOverlay> createState() => _AasPassSplashOverlayState();
}
class _AasPassSplashOverlayState extends State<AasPassSplashOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(vsync:this,duration:const Duration(milliseconds:1300))..repeat(reverse:true);
  @override void dispose(){controller.dispose();super.dispose();}
  @override Widget build(BuildContext context)=>Material(color:Colors.white,child:Center(child:AnimatedBuilder(animation:controller,builder:(_,_) {final t=controller.value;return Column(mainAxisSize:MainAxisSize.min,children:[SizedBox(height:112,child:Stack(alignment:Alignment.center,children:[Transform.translate(offset:Offset(-28,-6*t),child:Image.asset('assets/products/banana.png',width:56,height:56)),Transform.translate(offset:Offset(28,6*t),child:Image.asset('assets/products/soap.png',width:56,height:56)),Positioned(bottom:5,child:Container(width:105,height:7,decoration:BoxDecoration(color:Colors.black.withValues(alpha:.08),borderRadius:BorderRadius.circular(99))))])),const SizedBox(height:22),Image.asset('assets/branding/AasPass-LOGO.png',height:38),const SizedBox(height:18),const Text('Getting your AasPass basket ready',style:TextStyle(fontSize:16,fontWeight:FontWeight.w900,color:AppTokens.ink)),const SizedBox(height:7),const Text('Nearby stores • fresh local picks • secure checkout',style:TextStyle(fontSize:10.5,color:AppTokens.muted)),const SizedBox(height:18),SizedBox(width:128,child:ClipRRect(borderRadius:BorderRadius.circular(99),child:const LinearProgressIndicator(minHeight:3,color:AppTokens.green,backgroundColor:AppTokens.mint)))]);})));}
