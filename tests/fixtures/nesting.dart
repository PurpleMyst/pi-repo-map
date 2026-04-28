import '../../../core/theme/alloro_theme.dart';
import '../domain/recipe.dart';
import 'widgets/recipe_detail_formatters.dart';

class RecipeDetailPage extends StatelessWidget {
  const RecipeDetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Text('Recipe');
  }

  void _openRecipe(Recipe recipe) {}
}

mixin Loggable {
  void log(String message) {}
}

enum RecipeStatus {
  draft,
  published,
}

extension RecipeTitle on Recipe {
  String get displayTitle => title;
}

Future<void> loadRecipe() async {}

const defaultServings = 4;
final recipeIds = <String>[];
