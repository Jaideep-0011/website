
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const Book = require('./models/Book');
const Order = require('./models/Order');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected successfully');

        app.listen(process.env.PORT || 3000, () => {
            console.log('Server running at http://localhost:3000');
        });
    })
    .catch((error) => {
        console.error('MongoDB connection failed:', error.message);
    });

// Get all books
app.get('/api/books', async (req, res) => {
    try {
        const books = await Book.find();
        res.json(books);
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve books' });
    }
});

// Search books by title or author
app.get('/api/books/search', async (req, res) => {
    try {
        const q = req.query.q;

        if (!q || !q.trim()) {
            return res.status(400).json({
                message: 'Please enter a title or author to search'
            });
        }

        const books = await Book.find({
            $or: [
                { title: { $regex: q.trim(), $options: 'i' } },
                { author: { $regex: q.trim(), $options: 'i' } }
            ]
        });

        res.json(books);
    } catch (error) {
        res.status(500).json({ message: 'Search failed' });
    }
});

// Add a book to the catalogue
app.post('/api/books', async (req, res) => {
    try {
        const { title, author, price, stock } = req.body;

        if (!title?.trim() || !author?.trim() ||
            price === undefined || stock === undefined ||
            price === '' || stock === '') {
            return res.status(400).json({
                message: 'All book fields are required'
            });
        }

        const parsedPrice = Number(price);
        const parsedStock = Number(stock);

        if (!Number.isFinite(parsedPrice) || parsedPrice < 0 ||
            !Number.isInteger(parsedStock) || parsedStock < 0) {
            return res.status(400).json({
                message: 'Price must be non-negative and stock must be a non-negative integer'
            });
        }

        const book = await Book.create({
            title: title.trim(),
            author: author.trim(),
            price: parsedPrice,
            stock: parsedStock
        });

        res.status(201).json({
            message: 'Book added successfully',
            book
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to add book' });
    }
});


app.post('/api/orders', async (req, res) => {
    try {
        const { bookId, quantity } = req.body;
        const qty = Number(quantity);

        if (!mongoose.isValidObjectId(bookId)) {
            return res.status(400).json({
                message: 'Invalid Book ID.'
            });
        }

        if (!Number.isInteger(qty) || qty < 1) {
            return res.status(400).json({
                message: 'Quantity must be a positive whole number.'
            });
        }

        // Find the book and check stock.
        const book = await Book.findById(bookId);

        if (!book) {
            return res.status(404).json({
                message: 'Book not found.'
            });
        }

        if (book.stock < qty) {
            return res.status(400).json({
                message: `Insufficient stock. Only ${book.stock} copies available.`
            });
        }

        // Decrease stock only if enough copies remain.
        const updatedBook = await Book.findOneAndUpdate(
            { _id: bookId, stock: { $gte: qty } },
            { $inc: { stock: -qty } },
            { new: true }
        );

        if (!updatedBook) {
            return res.status(400).json({
                message: 'Stock changed. Please try again.'
            });
        }

        try {
            const order = await Order.create({
                bookId: book._id,
                bookTitle: book.title,
                quantity: qty,
                totalPrice: book.price * qty
            });

            res.status(201).json({
                message: 'Order placed successfully!',
                order
            });
        } catch (error) {
            // Restore stock if saving the order fails.
            await Book.updateOne(
                { _id: bookId },
                { $inc: { stock: qty } }
            );

            throw error;
        }
    } catch (error) {
        console.error('Order error:', error.message);
        res.status(500).json({
            message: 'Order could not be processed.'
        });
    }
});
