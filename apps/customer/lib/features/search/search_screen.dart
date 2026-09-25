import 'package:flutter/material.dart';
import '../../app_controller.dart';
import '../../core/api/aaspass_api.dart';
import '../../core/widgets/ui.dart';
import '../../models/domain.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({this.query, required this.cart, super.key});
  final String? query; final CartController cart;
  @override State<SearchScreen> createState()=>_SearchScreenState();
}
class _SearchScreenState extends State<SearchScreen>{
  late final TextEditingController controller=TextEditingController(text:widget.query??'');
  List<Product> products=const []; bool loading=true;
  @override void initState(){super.initState();_load();}
  @override void dispose(){controller.dispose();super.dispose();}
  Future<void> _load() async { setState(()=>loading=true); try { final vendors=await AasPassApi.instance.vendors(query:controller.text.trim()); final lists=await Future.wait(vendors.take(12).map((v)=>AasPassApi.instance.vendorProducts('${v['id']}',query:controller.text.trim()))); final out=<Product>[]; for(final list in lists){out.addAll(list.map((j)=>Product.fromJson({...j,'image':_image('${j['name']} ${j['category_name']??''}')})));} if(mounted)setState(() { products = out; loading = false; }); } catch(_){if(mounted)setState(()=>loading=false);} }
  String _image(String text){final t=text.toLowerCase();if(t.contains('chip'))return 'assets/products/chips.png';if(t.contains('bhujia')||t.contains('namkeen'))return 'assets/products/bhujia.png';if(t.contains('milk'))return 'assets/products/milk.png';if(t.contains('banana'))return 'assets/products/banana.png';if(t.contains('soap'))return 'assets/products/soap.png';if(t.contains('clean'))return 'assets/products/cleaner.png';if(t.contains('egg'))return 'assets/products/eggs.png';if(t.contains('cable'))return 'assets/products/cable.png';return 'assets/products/atta.png';}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Search',style:TextStyle(fontWeight:FontWeight.w900)),bottom:PreferredSize(preferredSize:const Size.fromHeight(70),child:Padding(padding:const EdgeInsets.fromLTRB(16,4,16,12),child:SearchBox(controller:controller,onChanged:(_){setState((){});})))),body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:_load,child:GridView.builder(padding:const EdgeInsets.fromLTRB(16,12,16,24),itemCount:products.length,gridDelegate:const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:2,crossAxisSpacing:10,mainAxisSpacing:10,mainAxisExtent:278),itemBuilder:(_,i)=>ProductCard(product:products[i],cart:widget.cart))));
}
