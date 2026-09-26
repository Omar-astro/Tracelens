from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

# Load the dataset
iris = load_iris()
X = iris.data       # Flower measurements
y = iris.target     # Species labels

# Split data into training and test sets
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Train the model
model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)

# Evaluate it
predictions = model.predict(X_test)
print("Accuracy:", accuracy_score(y_test, predictions))

# Predict a new flower:
# [sepal length, sepal width, petal length, petal width] in cm
new_flower = [[5.1, 3.5, 1.4, 0.2]]
prediction = model.predict(new_flower)[0]

print("Predicted species:", iris.target_names[prediction])